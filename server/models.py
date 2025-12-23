from pydantic import BaseModel
from typing import Optional
from enum import Enum


class JobStatus(str, Enum):
    idle = "idle"
    uploading = "uploading"
    processing = "processing"
    complete = "complete"
    error = "error"


class ImageUploadResponse(BaseModel):
    imageId: str
    filename: str
    width: int
    height: int
    size: int


class GenerateRequest(BaseModel):
    imageId: str


class SplatJob(BaseModel):
    jobId: str
    imageId: str
    status: JobStatus
    progress: Optional[float] = None
    splatUrl: Optional[str] = None
    splatPath: Optional[str] = None  # Absolute file path for mesh conversion
    videoUrl: Optional[str] = None
    processingTimeMs: Optional[int] = None
    error: Optional[str] = None
