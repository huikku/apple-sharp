import axios, { AxiosError } from 'axios';
import type { ImageUploadResponse, SplatJob } from '../types';

// In production, use Modal API URL from env var
// In development, use empty string (Vite proxy handles routing)
export const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 120000, // 2 minute timeout for cold starts
});

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
            return 'Image file is too large. Please use an image under 10MB.';
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

// Wrap API calls with better error handling
async function handleApiError<T>(promise: Promise<T>, context: string = ''): Promise<T> {
    try {
        return await promise;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new ApiError(error, context);
        }
        throw error;
    }
}

export async function uploadImage(file: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return handleApiError(
        api.post<ImageUploadResponse>('/api/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }).then(r => r.data),
        'upload'
    );
}

export async function generateSplat(imageId: string): Promise<SplatJob> {
    return handleApiError(
        api.post<SplatJob>('/api/generate', { imageId }).then(r => r.data),
        'generate'
    );
}

export async function getSplatStatus(jobId: string): Promise<SplatJob> {
    return handleApiError(
        api.get<SplatJob>(`/api/status/${jobId}`).then(r => r.data),
        'status'
    );
}

export function getSplatDownloadUrl(jobId: string): string {
    return `/api/download/${jobId}`;
}

export async function healthCheck(): Promise<boolean> {
    try {
        await api.get('/api/health');
        return true;
    } catch {
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
    return handleApiError(
        api.post<MeshConvertResponse>('/api/mesh/convert', request, {
            timeout: 300000, // 5 minute timeout for mesh conversion
        }).then(r => r.data),
        'mesh'
    );
}

export function getMeshDownloadUrl(filename: string): string {
    return `/api/mesh/download/${filename}`;
}

export async function getMeshMethods(): Promise<MeshMethodsResponse> {
    return handleApiError(
        api.get<MeshMethodsResponse>('/api/mesh/methods').then(r => r.data),
        'mesh'
    );
}
