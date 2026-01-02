/**
 * Client-side mesh export utilities using Three.js exporters.
 * Converts loaded geometry directly in the browser - no server needed.
 */

import * as THREE from 'three';

// Simple OBJ exporter (no external dependency needed)
export function exportToOBJ(geometry: THREE.BufferGeometry, filename: string = 'mesh.obj'): void {
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');

    if (!positions) {
        throw new Error('Geometry has no position attribute');
    }

    let objContent = '# Exported from Sharp 3D Viewer\n';
    objContent += `# Vertices: ${positions.count}\n\n`;

    // Export vertices
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        objContent += `v ${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`;

        // Add vertex colors if available (as comment or extended OBJ)
        if (colors) {
            const r = colors.getX(i);
            const g = colors.getY(i);
            const b = colors.getZ(i);
            objContent += ` ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}`;
        }
        objContent += '\n';
    }

    // For point clouds, we don't have faces - just vertices
    // If indices exist, export faces
    const indices = geometry.getIndex();
    if (indices) {
        objContent += '\n# Faces\n';
        for (let i = 0; i < indices.count; i += 3) {
            const a = indices.getX(i) + 1;
            const b = indices.getX(i + 1) + 1;
            const c = indices.getX(i + 2) + 1;
            objContent += `f ${a} ${b} ${c}\n`;
        }
    }

    downloadBlob(objContent, filename, 'text/plain');
}

// Export to PLY format (preserves colors)
export function exportToPLY(geometry: THREE.BufferGeometry, filename: string = 'splat.ply'): void {
    const positions = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');

    if (!positions) {
        throw new Error('Geometry has no position attribute');
    }

    const hasColors = !!colors;
    const vertexCount = positions.count;

    // PLY header
    let header = 'ply\n';
    header += 'format ascii 1.0\n';
    header += 'comment Exported from Sharp 3D Viewer\n';
    header += `element vertex ${vertexCount}\n`;
    header += 'property float x\n';
    header += 'property float y\n';
    header += 'property float z\n';
    if (hasColors) {
        header += 'property uchar red\n';
        header += 'property uchar green\n';
        header += 'property uchar blue\n';
    }
    header += 'end_header\n';

    // Vertex data
    const lines: string[] = [header];
    for (let i = 0; i < vertexCount; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        let line = `${x.toFixed(6)} ${y.toFixed(6)} ${z.toFixed(6)}`;

        if (hasColors) {
            const r = Math.round(colors.getX(i) * 255);
            const g = Math.round(colors.getY(i) * 255);
            const b = Math.round(colors.getZ(i) * 255);
            line += ` ${r} ${g} ${b}`;
        }

        lines.push(line);
    }

    downloadBlob(lines.join('\n'), filename, 'application/octet-stream');
}

// Export to GLB format using Three.js GLTFExporter
export async function exportToGLB(geometry: THREE.BufferGeometry, filename: string = 'mesh.glb'): Promise<void> {
    // Dynamically import GLTFExporter
    const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');

    // For point clouds, use Points instead of Mesh
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ vertexColors: true, size: 0.01 }));

    const exporter = new GLTFExporter();

    return new Promise((resolve, reject) => {
        exporter.parse(
            points,
            (result) => {
                if (result instanceof ArrayBuffer) {
                    const blob = new Blob([result], { type: 'application/octet-stream' });
                    downloadBlobObj(blob, filename);
                    resolve();
                }
            },
            (error) => {
                reject(error);
            },
            { binary: true }
        );
    });
}

// Helper to download blob
function downloadBlob(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    downloadBlobObj(blob, filename);
}

function downloadBlobObj(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Get geometry reference from store (will be set by SplatViewer)
let storedGeometry: THREE.BufferGeometry | null = null;

export function setExportGeometry(geometry: THREE.BufferGeometry | null): void {
    storedGeometry = geometry;
}

export function getExportGeometry(): THREE.BufferGeometry | null {
    return storedGeometry;
}

// Export based on format
export async function exportGeometry(format: 'obj' | 'ply' | 'glb', jobId?: string): Promise<void> {
    const geometry = getExportGeometry();
    if (!geometry) {
        throw new Error('No geometry loaded to export');
    }

    const baseFilename = jobId ? `splat_${jobId}` : 'splat';

    switch (format) {
        case 'obj':
            exportToOBJ(geometry, `${baseFilename}.obj`);
            break;
        case 'ply':
            exportToPLY(geometry, `${baseFilename}.ply`);
            break;
        case 'glb':
            await exportToGLB(geometry, `${baseFilename}.glb`);
            break;
    }
}
