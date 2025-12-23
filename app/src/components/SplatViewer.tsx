import { useRef, useMemo, Suspense, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { loadGaussianSplatPLY, createGaussianSplatGeometry } from '../utils/gaussianSplatLoader';

interface SplatViewerProps {
    splatUrl?: string;
    showAxes?: boolean;
    autoRotate?: boolean;
    pointSize?: number;
    showColors?: boolean;
    pointShape?: 'square' | 'circle';
}

interface PointCloudMeshProps {
    url: string;
    pointSize?: number;
    showColors?: boolean;
    pointShape?: 'square' | 'circle';
}

function PointCloudMesh({ url, pointSize = 0.005, showColors = true, pointShape = 'circle' }: PointCloudMeshProps) {
    const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const meshRef = useRef<THREE.Points>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadData() {
            try {
                setLoading(true);
                setError(null);

                console.log('Loading Gaussian splat from:', url);
                const data = await loadGaussianSplatPLY(url);

                if (cancelled) return;

                console.log(`Loaded ${data.count} Gaussians with colors`);
                const geo = createGaussianSplatGeometry(data);
                setGeometry(geo);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load Gaussian splat:', err);
                setError(err instanceof Error ? err.message : 'Failed to load');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        loadData();
        return () => { cancelled = true; };
    }, [url]);

    const material = useMemo(() => {
        if (pointShape === 'circle') {
            // Custom shader for circular points
            return new THREE.ShaderMaterial({
                uniforms: {
                    pointSize: { value: pointSize * 100 },
                    useVertexColors: { value: showColors ? 1.0 : 0.0 },
                },
                vertexShader: `
                    uniform float pointSize;
                    uniform float useVertexColors;
                    varying vec3 vColor;
                    void main() {
                        vColor = useVertexColors > 0.5 ? color : vec3(0.8);
                        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                        gl_PointSize = pointSize / -mvPosition.z;
                        gl_Position = projectionMatrix * mvPosition;
                    }
                `,
                fragmentShader: `
                    varying vec3 vColor;
                    void main() {
                        vec2 center = gl_PointCoord - vec2(0.5);
                        float dist = length(center);
                        if (dist > 0.5) discard;
                        float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
                        gl_FragColor = vec4(vColor, alpha * 0.95);
                    }
                `,
                vertexColors: true,
                transparent: true,
                depthWrite: false,
            });
        } else {
            return new THREE.PointsMaterial({
                size: pointSize,
                vertexColors: showColors,
                color: showColors ? undefined : 0xcccccc,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.95,
            });
        }
    }, [pointSize, showColors, pointShape]);

    if (loading) {
        return (
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshBasicMaterial color="#68A9EC" wireframe />
            </mesh>
        );
    }

    if (error || !geometry) {
        return (
            <mesh>
                <boxGeometry args={[0.3, 0.3, 0.3]} />
                <meshBasicMaterial color="#C32D2D" wireframe />
            </mesh>
        );
    }

    return <points ref={meshRef} geometry={geometry} material={material} />;
}

function RotatingGroup({ autoRotate, children }: { autoRotate: boolean; children: React.ReactNode }) {
    const groupRef = useRef<THREE.Group>(null);

    useFrame((_, delta) => {
        if (autoRotate && groupRef.current) {
            groupRef.current.rotation.y += delta * 0.2;
        }
    });

    return <group ref={groupRef}>{children}</group>;
}

function LoadingFallback() {
    return (
        <mesh>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#68A9EC" wireframe />
        </mesh>
    );
}

export function SplatViewer({
    splatUrl,
    showAxes = true,
    autoRotate = false,
    pointSize = 0.005,
    showColors = true,
    pointShape = 'circle'
}: SplatViewerProps) {
    return (
        <div className="bg-card rounded-md border border-metal overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-metal flex items-center justify-between shrink-0">
                <h2 className="font-display text-base tracking-tight text-[var(--foreground)]">
                    3D VIEWER
                </h2>
                {!splatUrl && (
                    <span className="text-xs text-muted uppercase tracking-wider">
                        AWAITING DATA
                    </span>
                )}
            </div>

            <div className="flex-1 bg-void min-h-0">
                {splatUrl ? (
                    <Canvas
                        camera={{ position: [0, 0, 2], fov: 60 }}
                        gl={{ antialias: true }}
                    >
                        <color attach="background" args={['#0A0C0E']} />
                        <ambientLight intensity={1} />

                        <Suspense fallback={<LoadingFallback />}>
                            <RotatingGroup autoRotate={autoRotate}>
                                <PointCloudMesh url={splatUrl} pointSize={pointSize} showColors={showColors} pointShape={pointShape} />
                            </RotatingGroup>
                        </Suspense>

                        {showAxes && <axesHelper args={[0.5]} />}

                        <Grid
                            position={[0, -0.5, 0]}
                            args={[10, 10]}
                            cellSize={0.25}
                            cellThickness={0.5}
                            cellColor="#464B4E"
                            sectionSize={1}
                            sectionThickness={1}
                            sectionColor="#6F7477"
                            fadeDistance={5}
                            fadeStrength={1}
                            followCamera={false}
                            infiniteGrid
                        />

                        <OrbitControls
                            enableDamping
                            dampingFactor={0.05}
                            minDistance={0.5}
                            maxDistance={10}
                        />
                    </Canvas>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-full border-2 border-dashed border-metal flex items-center justify-center">
                                <span className="text-2xl text-muted">◇</span>
                            </div>
                            <p className="text-sm text-muted">
                                GENERATE SPLAT TO VIEW 3D
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
