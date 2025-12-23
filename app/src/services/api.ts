import axios from 'axios';
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


export async function uploadImage(file: File): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<ImageUploadResponse>('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
}

export async function generateSplat(imageId: string): Promise<SplatJob> {
    const response = await api.post<SplatJob>('/api/generate', { imageId });
    return response.data;
}

export async function getSplatStatus(jobId: string): Promise<SplatJob> {
    const response = await api.get<SplatJob>(`/api/status/${jobId}`);
    return response.data;
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
    const response = await api.post<MeshConvertResponse>('/api/mesh/convert', request, {
        timeout: 300000, // 5 minute timeout for mesh conversion
    });
    return response.data;
}

export function getMeshDownloadUrl(filename: string): string {
    return `/api/mesh/download/${filename}`;
}

export async function getMeshMethods(): Promise<MeshMethodsResponse> {
    const response = await api.get<MeshMethodsResponse>('/api/mesh/methods');
    return response.data;
}
