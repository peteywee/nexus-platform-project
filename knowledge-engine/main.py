import os, magic
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from sqlalchemy import create_engine, Column, Integer, String, LargeBinary, DateTime, func, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from io import BytesIO
from langchain_community.document_loaders import UnstructuredFileLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import SentenceTransformerEmbeddings
from qdrant_client import QdrantClient, models

# --- DB & App Configuration ---
DB_USER=os.getenv("KNOWLEDGE_DB_USER"); DB_PASS=os.getenv("KNOWLEDGE_DB_PASSWORD")
DB_HOST=os.getenv("KNOWLEDGE_DB_HOST"); DB_NAME=os.getenv("KNOWLEDGE_DB_NAME")
DATABASE_URL=f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"
QDRANT_HOST=os.getenv("QDRANT_HOST", "localhost"); EMBEDDING_MODEL="all-MiniLM-L6-v2"
KNOWLEDGE_COLLECTION="nexus-knowledge-base"

engine=create_engine(DATABASE_URL); SessionLocal=sessionmaker(bind=engine)
Base=declarative_base(); app=FastAPI()

class SourceDocument(Base):
  __tablename__ = "source_documents"; id=Column(Integer, primary_key=True)
  filename=Column(String); mimetype=Column(String); content=Column(LargeBinary, nullable=False)
  status=Column(String, default="pending"); error=Column(Text); created_at=Column(DateTime(timezone=True), server_default=func.now())

qdrant_client=QdrantClient(host=QDRANT_HOST, port=6333)
embedding_model=SentenceTransformerEmbeddings(model_name=EMBEDDING_MODEL, cache_folder='/app/data')
text_splitter=RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)

@app.on_event("startup")
def on_startup():
  Base.metadata.create_all(bind=engine)
  try: qdrant_client.get_collection(collection_name=KNOWLEDGE_COLLECTION)
  except Exception: qdrant_client.recreate_collection(collection_name=KNOWLEDGE_COLLECTION, vectors_config=models.VectorParams(size=embedding_model.client.get_sentence_embedding_dimension(), distance=models.Distance.COSINE))

def process_text(text, source):
  chunks=text_splitter.split_text(text)
  if not chunks: return
  vectors=embedding_model.embed_documents(chunks)
  qdrant_client.upsert(collection_name=KNOWLEDGE_COLLECTION, points=models.Batch(ids=[models.PointIds.get_random_id() for _ in chunks], vectors=vectors, payloads=[{"text": chunk, "source": source} for chunk in chunks]), wait=True)

def process_doc_from_db(doc_id: int):
  db=SessionLocal(); doc=db.query(SourceDocument).filter(SourceDocument.id == doc_id).first()
  if not doc: return
  try:
    temp_path=f"/tmp/{doc.filename}";
    with open(temp_path, "wb") as f: f.write(BytesIO(doc.content).getbuffer())
    docs=UnstructuredFileLoader(file_path=temp_path).load()
    process_text(" ".join([d.page_content for d in docs]), f"doc:{doc.filename}")
    doc.status="success"
  except Exception as e: doc.status="failed"; doc.error=str(e)
  finally: db.add(doc); db.commit(); db.close()

@app.post("/ingest")
async def ingest_doc(bg: BackgroundTasks, file: UploadFile=File(...)):
  db=SessionLocal(); content=await file.read()
  doc=SourceDocument(filename=file.filename, mimetype=magic.from_buffer(content, mime=True), content=content)
  db.add(doc); db.commit(); db.refresh(doc); bg.add_task(process_doc_from_db, doc.id)
  db.close(); return {"document_id": doc.id, "filename": doc.filename, "status": "pending"}

@app.post("/events")
async def handle_event(event: dict, bg: BackgroundTasks):
  if event.get('type') == 'RESULT' and 'summary' in event.get('payload'):
    bg.add_task(process_text, event['payload']['summary'], event.get('source_agent', 'unknown_agent'))
  return {"status": "event accepted"}

@app.post("/query")
async def query_kb(query: dict):
  hits=qdrant_client.search(collection_name=KNOWLEDGE_COLLECTION, query_vector=embedding_model.embed_query(query.get('question')), limit=3)
  return {"results": [{"score": h.score, "source": h.payload.get('source'), "text": h.payload.get('text')} for h in hits]}
