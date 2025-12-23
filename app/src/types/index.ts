export type JobStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error';

export interface ImageUploadResponse {
    imageId: string;
    filename: string;
    width: number;
    height: number;
    size: number;
}

export interface SplatJob {
    jobId: string;
    imageId: string;
    status: JobStatus;
    progress?: number;
    splatUrl?: string;
    splatPath?: string;  // Absolute file path for mesh conversion
    videoUrl?: string;
    processingTimeMs?: number;
    error?: string;
}

export interface ViewerConfig {
    pointSize: number;
    showAxes: boolean;
    autoRotate: boolean;
}

export interface AppState {
    uploadedImage: ImageUploadResponse | null;
    currentJob: SplatJob | null;
    viewerConfig: ViewerConfig;
}
