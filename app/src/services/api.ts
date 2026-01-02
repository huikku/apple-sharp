import axios, { AxiosError } from 'axios';
import type { ImageUploadResponse, SplatJob, UsageStats, CostStats } from '../types';

// In production, use Modal API URL from env var
// In development, use empty string (Vite proxy handles routing)
export const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 120000, // 2 minute timeout for cold starts
});

// Check if backend is reachable
export async function checkHealth(): Promise<boolean> {
    try {
        await api.get('/api/health', { timeout: 30000 });
        return true;
    } catch {
        return false;
    }
}

// Helper to get full URL for resources (handles both dev and prod)
export function getFullApiUrl(path: string): string {
    if (!path) return '';
    // If path is already absolute, return as-is
    if (path.startsWith('http')) return path;
    // Otherwise prepend API_BASE
    return `${API_BASE}${path}`;
}

// Custom error class for user-friendly error messages
export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly userMessage: string;
    public readonly isRetryable: boolean;
    public readonly retryAfter?: number;

    constructor(error: AxiosError, context: string = '') {
        const statusCode = error.response?.status || 0;
        const userMessage = getErrorMessage(statusCode, context);
        super(userMessage);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.userMessage = userMessage;
        this.isRetryable = isRetryableError(statusCode);
        this.retryAfter = getRetryAfter(error);
    }
}

function getErrorMessage(status: number, context: string): string {
    switch (status) {
        case 429:
            return 'Server is busy with other requests. Please wait 30-60 seconds and try again.';
        case 503:
            return 'Server is starting up (cold start). Please wait 1-2 minutes and try again.';
        case 504:
            return 'Request timed out. The server may be processing a large queue. Please try again.';
        case 500:
            return 'Server error occurred. Please try again in a moment.';
        case 413:
            return 'Image file is too large. Please use an image under 50MB.';
        case 404:
            return context === 'generate'
                ? 'Image not found. Please upload again.'
                : 'Resource not found.';
        case 0:
            return 'Cannot connect to server. Please check your internet connection.';
        default:
            return `Request failed (Error ${status}). Please try again.`;
    }
}

function isRetryableError(status: number): boolean {
    return [429, 503, 504, 500, 0].includes(status);
}

function getRetryAfter(error: AxiosError): number | undefined {
    const retryHeader = error.response?.headers?.['retry-after'];
    if (retryHeader) {
        const seconds = parseInt(retryHeader, 10);
        return isNaN(seconds) ? 30 : seconds;
    }
    // Default retry times based on status
    const status = error.response?.status || 0;
    if (status === 429) return 30;
    if (status === 503) return 60;
    return undefined;
}

// Sleep helper for retry delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry with exponential backoff for retryable errors
async function withRetry<T>(
    fn: () => Promise<T>,
    context: string = '',
    maxRetries: number = 3,
    baseDelayMs: number = 5000
): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status || 0;
                const isRetryable = [429, 503, 504].includes(status);

                if (isRetryable && attempt < maxRetries) {
                    // Exponential backoff: 5s, 10s, 20s
                    const delay = baseDelayMs * Math.pow(2, attempt);
                    console.log(`[API] ${context}: Got ${status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
                    await sleep(delay);
                    continue;
                }

                lastError = new ApiError(error, context);
            } else {
                lastError = error instanceof Error ? error : new Error(String(error));
            }
            break;
        }
    }

    throw lastError;
}

export async function uploadImage(file: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return withRetry(
        () => api.post<ImageUploadResponse>('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data),
        'upload',
        3,  // 3 retries
        5000 // Start with 5 second delay
    );
}

export async function generateSplat(imageId: string): Promise<SplatJob> {
    return withRetry(
        () => api.post<SplatJob>('/api/generate', { imageId }).then(r => r.data),
        'generate',
        3,
        5000
    );
}

export async function getSplatStatus(jobId: string): Promise<SplatJob> {
    return withRetry(
        () => api.get<SplatJob>(`/api/status/${jobId}`).then(r => r.data),
        'status',
        2,
        3000
    );
}


export function getSplatDownloadUrl(jobId: string): string {
    return `/api/download/${jobId}`;
}

export async function healthCheck(): Promise<boolean> {
    try {
        await api.get('/api/health');
        return true;
    } catch (error) {
        // 429 means server is responding but rate limited - still "online"
        if (axios.isAxiosError(error) && error.response?.status === 429) {
            return true;
        }
        return false;
    }
}

// Mesh conversion types
export interface MeshConvertRequest {
    splat_path: string;
    method: 'poisson' | 'ball_pivoting' | 'alpha_shape';
    output_format: 'obj' | 'glb' | 'ply';
    depth?: number;
    alpha?: number;
}

export interface MeshConvertResponse {
    success: boolean;
    mesh_path: string;
    mesh_filename: string;
    vertex_count: number;
    face_count: number;
    method: string;
    format: string;
    download_url: string;
}

export interface MeshMethod {
    id: string;
    name: string;
    description: string;
    parameters: { name: string; type: string; default: number; range: number[] }[];
}

export interface MeshMethodsResponse {
    methods: MeshMethod[];
    formats: string[];
}

export async function convertToMesh(request: MeshConvertRequest): Promise<MeshConvertResponse> {
    return withRetry(
        () => api.post<MeshConvertResponse>('/api/mesh/convert', request, {
            timeout: 300000, // 5 minute timeout for mesh conversion
        }).then(r => r.data),
        'mesh',
        2,
        10000
    );
}

export function getMeshDownloadUrl(filename: string): string {
    return `/api/mesh/download/${filename}`;
}

export async function getMeshMethods(): Promise<MeshMethodsResponse> {
    return withRetry(
        () => api.get<MeshMethodsResponse>('/api/mesh/methods').then(r => r.data),
        'mesh',
        2,
        3000
    );
}

export async function getUsageStats(): Promise<UsageStats> {
    return api.get<UsageStats>('/api/stats').then(r => r.data);
}

export async function getCostStats(): Promise<CostStats> {
    return api.get<CostStats>('/api/costs').then(r => r.data);
}

