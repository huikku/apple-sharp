export type JobStatus = 'idle' | 'uploading' | 'queued' | 'processing' | 'complete' | 'error';

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
    status: 'queued' | 'processing' | 'complete' | 'error';
    statusDetail?: string;  // GPU status, inference status, etc.
    progress?: number;
    splatUrl?: string;
    splatPath?: string;  // Absolute file path for mesh conversion
    videoUrl?: string;
    processingTimeMs?: number;
    error?: string;
    queuePosition?: number;
    estimatedWaitSeconds?: number;
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
