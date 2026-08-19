import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# RAG insurance only, unused by default. Retrieval is behind RetrieverProtocol;
# the MVP uses FewShotRetriever (no vector store). See PLAN.md "Vector store / RAG".
# section_type: 'session_plan' | 'info_sheet' | 'task_sheet' | 'self_check'
#               | 'answer_key' | 'cbc_module'


class CorpusChunk(Base):
    __tablename__ = "corpus_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    section_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    vector_id: Mapped[str | None] = mapped_column(Text, unique=True)
    source_doc: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
