import * as THREE from 'three';

interface GaussianSplatData {
    positions: Float32Array;
    colors: Float32Array;
    count: number;
}

interface PropertyInfo {
    name: string;
    type: string;
    offset: number;
    size: number;
}

/**
 * Custom loader for 3D Gaussian Splat PLY files.
 * Parses the f_dc_0, f_dc_1, f_dc_2 spherical harmonics and converts to RGB.
 */
export async function loadGaussianSplatPLY(url: string): Promise<GaussianSplatData> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    // Parse PLY header
    const textDecoder = new TextDecoder();
    const headerView = new Uint8Array(buffer, 0, Math.min(8192, buffer.byteLength));
    const headerText = textDecoder.decode(headerView);

    const headerEndMatch = headerText.match(/end_header\n/);
    if (!headerEndMatch) {
        throw new Error('Invalid PLY file: no end_header found');
    }

    // Find the byte position of end_header in the original buffer
    const encoder = new TextEncoder();
    const headerBytes = encoder.encode(headerText.substring(0, headerEndMatch.index! + headerEndMatch[0].length));
    const headerLength = headerBytes.length;

    const header = headerText.substring(0, headerEndMatch.index! + headerEndMatch[0].length);
    console.log('PLY Header length:', headerLength);

    // Parse the header to extract vertex element info
    const lines = header.split('\n');

    let vertexCount = 0;
    let inVertexElement = false;
    const vertexProperties: PropertyInfo[] = [];
    let currentOffset = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // Check for element declarations
        const elementMatch = trimmed.match(/^element\s+(\w+)\s+(\d+)/);
        if (elementMatch) {
            if (elementMatch[1] === 'vertex') {
                vertexCount = parseInt(elementMatch[2], 10);
                inVertexElement = true;
            } else {
                inVertexElement = false;
            }
            continue;
        }

        // Only parse properties when inside vertex element
        if (inVertexElement) {
            const propMatch = trimmed.match(/^property\s+(\w+)\s+(\w+)/);
            if (propMatch) {
                const type = propMatch[1];
                const name = propMatch[2];
                let size = 4; // Default to float

                if (type === 'float' || type === 'float32' || type === 'int' || type === 'uint') {
                    size = 4;
                } else if (type === 'double' || type === 'float64') {
                    size = 8;
                } else if (type === 'uchar' || type === 'char' || type === 'uint8' || type === 'int8') {
                    size = 1;
                } else if (type === 'short' || type === 'ushort') {
                    size = 2;
                }

                vertexProperties.push({ name, type, offset: currentOffset, size });
                currentOffset += size;
            }
        }
    }

    const vertexSize = currentOffset;
    console.log('Vertex count:', vertexCount, 'Vertex size:', vertexSize, 'bytes');
    console.log('Vertex properties:', vertexProperties.map(p => p.name).join(', '));

    // Find property indices
    const findProp = (name: string) => vertexProperties.find(p => p.name === name);
    const xProp = findProp('x');
    const yProp = findProp('y');
    const zProp = findProp('z');
    const fdc0Prop = findProp('f_dc_0');
    const fdc1Prop = findProp('f_dc_1');
    const fdc2Prop = findProp('f_dc_2');

    if (!xProp || !yProp || !zProp) {
        throw new Error('PLY file missing position properties (x, y, z)');
    }

    console.log('Found SH properties:', !!fdc0Prop, !!fdc1Prop, !!fdc2Prop);

    // Create output arrays
    const positions = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);

    // SH coefficient for degree-0: sqrt(1 / (4 * PI))
    const SH_C0 = 0.28209479177387814;

    // Read binary vertex data
    const dataView = new DataView(buffer, headerLength);

    for (let i = 0; i < vertexCount; i++) {
        const baseOffset = i * vertexSize;

        // Read position
        const x = dataView.getFloat32(baseOffset + xProp.offset, true);
        const y = dataView.getFloat32(baseOffset + yProp.offset, true);
        const z = dataView.getFloat32(baseOffset + zProp.offset, true);

        // Apply coordinate transform: OpenCV (Y-down, Z-forward) to Three.js (Y-up, Z-back)
        positions[i * 3] = x;
        positions[i * 3 + 1] = -y;
        positions[i * 3 + 2] = -z;

        // Read colors from spherical harmonics
        if (fdc0Prop && fdc1Prop && fdc2Prop) {
            const sh0 = dataView.getFloat32(baseOffset + fdc0Prop.offset, true);
            const sh1 = dataView.getFloat32(baseOffset + fdc1Prop.offset, true);
            const sh2 = dataView.getFloat32(baseOffset + fdc2Prop.offset, true);

            // Convert SH to RGB: color = sh * coeff + 0.5
            colors[i * 3] = Math.max(0, Math.min(1, sh0 * SH_C0 + 0.5));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, sh1 * SH_C0 + 0.5));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, sh2 * SH_C0 + 0.5));
        } else {
            // Fallback: height-based gradient
            colors[i * 3] = 0.5;
            colors[i * 3 + 1] = 0.7;
            colors[i * 3 + 2] = 0.9;
        }
    }

    console.log('Loaded Gaussian splat with', vertexCount, 'points');

    return { positions, colors, count: vertexCount };
}

/**
 * Create a Three.js BufferGeometry from Gaussian splat data.
 */
export function createGaussianSplatGeometry(data: GaussianSplatData): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));

    geometry.computeBoundingBox();
    geometry.center();

    return geometry;
}
