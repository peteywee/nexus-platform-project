import os, pandas as pd
from fastapi import FastAPI, UploadFile, File, BackgroundTasks
from sqlalchemy import create_engine, Column, Integer, String, LargeBinary, DateTime, func, Text, Numeric, TIMESTAMP
from sqlalchemy.orm import sessionmaker, declarative_base
from io import StringIO

DB_USER=os.getenv("FINANCIAL_DB_USER"); DB_PASS=os.getenv("FINANCIAL_DB_PASSWORD")
DB_HOST=os.getenv("FINANCIAL_DB_HOST"); DB_NAME=os.getenv("FINANCIAL_DB_NAME")
DATABASE_URL=f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}/{DB_NAME}"

engine=create_engine(DATABASE_URL); SessionLocal=sessionmaker(bind=engine)
Base=declarative_base(); app=FastAPI()

class SourceDocument(Base):
  __tablename__="source_documents"; id=Column(Integer, primary_key=True)
  filename=Column(String); content=Column(LargeBinary, nullable=False)
  status=Column(String, default="pending"); error=Column(Text)
  created_at=Column(DateTime(timezone=True), server_default=func.now())

class Transaction(Base):
  __tablename__="transactions"; id=Column(Integer, primary_key=True)
  date=Column(TIMESTAMP); description=Column(Text); amount=Column(Numeric(10, 2))
  category=Column(String, index=True)

@app.on_event("startup")
def on_startup(): Base.metadata.create_all(bind=engine)

def process_financial_doc(doc_id: int):
  db=SessionLocal(); doc=db.query(SourceDocument).filter(SourceDocument.id == doc_id).first()
  if not doc: return
  try:
    df=pd.read_csv(StringIO(doc.content.decode("utf-8")))
    df.rename(columns={"Transaction Date": "date", "Description": "description", "Amount": "amount"}, inplace=True)
    df['date']=pd.to_datetime(df['date']); df['amount']=pd.to_numeric(df['amount'])
    df['category']=df['description'].apply(lambda x: 'Coffee' if 'STARBUCKS' in x.upper() else 'Travel' if 'UBER' in x.upper() else 'Other')
    df_to_sql = df[['date', 'description', 'amount', 'category']]
    df_to_sql.to_sql('transactions', engine, if_exists='append', index=False)
    doc.status="success"
  except Exception as e: doc.status="failed"; doc.error=str(e)
  finally: db.add(doc); db.commit(); db.close()

@app.post("/ingest/transactions")
async def ingest_trans(bg: BackgroundTasks, file: UploadFile = File(...)):
  db = SessionLocal(); content = await file.read(); doc = SourceDocument(filename=file.filename, content=content)
  db.add(doc); db.commit(); db.refresh(doc); bg.add_task(process_financial_doc, doc.id)
  db.close(); return {"document_id": doc.id, "status": "pending"}

@app.get("/api/financial/summary/by_category")
async def get_summary():
  return pd.read_sql("SELECT category, SUM(amount) as total FROM transactions GROUP BY category ORDER BY total DESC;", engine).to_dict(orient='records')
