import { useState, useCallback, useEffect } from 'react';
import { Coffee } from 'lucide-react';
import { Header } from './components/Header';
import { ImageUpload } from './components/ImageUpload';
import { ControlPanel } from './components/ControlPanel';
import { OutputsPanel } from './components/OutputsPanel';
import { SplatViewer } from './components/SplatViewer';
import { LogPanel, useLogs } from './components/LogPanel';
import { DocsModal } from './components/DocsModal';
import { StatsDashboard } from './components/StatsDashboard';
import { useMediaQuery } from './hooks/useMediaQuery';
import * as api from './services/api';
import type { JobStatus, ImageUploadResponse, SplatJob } from './types';

function App() {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [uploadedImage, setUploadedImage] = useState<ImageUploadResponse | null>(null);
  const [currentJob, setCurrentJob] = useState<SplatJob | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [backendOnline, setBackendOnline] = useState(false);
  const { logs, clearLogs, logError, logSuccess, logInfo } = useLogs();

  // Mobile layout state
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const [mobileScreen, setMobileScreen] = useState<0 | 1 | 2>(0); // Default to Workflow on mobile

  // View settings state
  const [showAxes, setShowAxes] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [pointSize, setPointSize] = useState(0.5);

  // Docs modal state
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Check backend health on mount (reduced frequency to avoid rate limits)
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const online = await api.healthCheck();
        setBackendOnline(online);
      } catch {
        setBackendOnline(false);
      }
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // If we transition to desktop, reset mobile screen
    if (!isMobile) setMobileScreen(1);
  }, [isMobile]);


  const handleUpload = useCallback(async (file: File) => {
    setStatus('uploading');
    setError(undefined);
    logInfo('UPLOAD', `Uploading ${file.name}...`);

    try {
      const response = await api.uploadImage(file);
      setUploadedImage(response);
      setStatus('idle');
      logSuccess('UPLOAD', `Image uploaded: ${response.filename} (${response.width}×${response.height})`);

      // Stay on workflow after upload - user will click Generate to switch to Viewer
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMsg);
      setStatus('error');
      logError('UPLOAD ERROR', errorMsg);
    }
  }, [logError, logSuccess, logInfo, isMobile]);

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) return;

    setStatus('processing');
    setError(undefined);
    logInfo('INFERENCE', 'Starting 3D Gaussian splat generation...');

    try {
      const job = await api.generateSplat(uploadedImage.imageId);
      setCurrentJob(job);

      if (job.status === 'queued' && job.queuePosition) {
        setStatus('queued');
        logInfo('QUEUE', `Position #${job.queuePosition} - estimated wait: ${job.estimatedWaitSeconds || 0}s`);
        // On mobile, switch to Viewer when generation starts
        if (isMobile) setMobileScreen(1);
      } else {
        logInfo('INFERENCE', `Job started: ${job.jobId}`);
        // On mobile, switch to Viewer when generation starts
        if (isMobile) setMobileScreen(1);
      }

      let isCompleted = false; // Guard to prevent duplicate completion handling

      const pollInterval = setInterval(async () => {
        if (isCompleted) return; // Skip if already completed

        try {
          const updatedJob = await api.getSplatStatus(job.jobId);
          setCurrentJob(updatedJob);

          if (updatedJob.status === 'queued') {
            setStatus('queued');
          } else if (updatedJob.status === 'processing') {
            setStatus('processing');
          }

          if (updatedJob.status === 'complete') {
            if (!isCompleted) {
              isCompleted = true;
              clearInterval(pollInterval);
              setStatus('complete');
              logSuccess('INFERENCE', `Complete in ${(updatedJob.processingTimeMs || 0) / 1000}s`);
            }
          } else if (updatedJob.status === 'error') {
            if (!isCompleted) {
              isCompleted = true;
              clearInterval(pollInterval);
              setStatus('error');
              setError(updatedJob.error);
              logError('INFERENCE', updatedJob.error || 'Generation failed');
            }
          }
        } catch (pollErr) {
          if (!isCompleted) {
            isCompleted = true;
            clearInterval(pollInterval);
            setStatus('error');
            const errorMsg = pollErr instanceof Error ? pollErr.message : 'Failed to check job status';
            setError(errorMsg);
            logError('CONNECTION', errorMsg);
          }
        }
      }, 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      setError(errorMsg);
      setStatus('error');
      logError('INFERENCE', errorMsg);
    }
  }, [uploadedImage, logError, logSuccess, logInfo]);


  const handleReset = useCallback(() => {
    setStatus('idle');
    setUploadedImage(null);
    setCurrentJob(null);
    setError(undefined);
    logInfo('RESET', 'Workspace cleared');
    if (isMobile) setMobileScreen(0); // Go back to workflow on reset
  }, [logInfo, isMobile]);

  return (
    <div className="h-screen bg-void flex flex-col overflow-hidden">
      <Header
        status={status}
        processingTime={currentJob?.processingTimeMs}
        error={error}
        backendOnline={backendOnline}
        onDocsClick={() => setIsDocsOpen(true)}
        currentJob={currentJob}
        mobileScreen={isMobile ? mobileScreen : undefined}
        onMobileScreenChange={setMobileScreen}
        onLog={(msg, type) => {
          if (type === 'error') logError('SERVER', msg);
          else if (type === 'success') logSuccess('SERVER', msg);
          else logInfo('SERVER', msg);
        }}
      />


      {/* Documentation Modal */}
      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {isMobile ? (
          <>
            {/* All screens are stacked absolutely - visibility controlled to preserve WebGL context */}
            <div className="flex-1 relative">
              {/* Viewer - always rendered to preserve WebGL context */}
              <div
                className={`absolute inset-0 p-2 transition-opacity duration-150 ${mobileScreen === 1 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
              >
                <SplatViewer
                  splatUrl={currentJob?.splatUrl ? api.getFullApiUrl(currentJob.splatUrl) : undefined}
                  showAxes={showAxes}
                  autoRotate={autoRotate}
                  pointSize={pointSize}
                />
              </div>

              {/* Workflow screen */}
              <div
                className={`absolute inset-0 transition-opacity duration-150 ${mobileScreen === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
              >
                <div className="w-full h-full p-4 pb-20 space-y-4 overflow-y-auto border-r border-metal bg-card/20">
                  <ImageUpload
                    onUpload={handleUpload}
                    uploadedImage={uploadedImage}
                    isUploading={status === 'uploading'}
                    disabled={status === 'processing'}
                  />
                  <ControlPanel
                    uploadedImage={uploadedImage}
                    status={status}
                    onGenerate={handleGenerate}
                    onReset={handleReset}
                    showAxes={showAxes}
                    onShowAxesChange={setShowAxes}
                    autoRotate={autoRotate}
                    onAutoRotateChange={setAutoRotate}
                    pointSize={pointSize}
                    onSplatScaleChange={setPointSize}
                    hasSplat={status === 'complete' && !!currentJob?.splatUrl}
                  />
                  <OutputsPanel
                    splatPath={currentJob?.splatPath || null}
                    splatUrl={currentJob?.splatUrl || null}
                    jobId={currentJob?.jobId || null}
                    isComplete={status === 'complete'}
                    onLog={(message, type) => {
                      if (type === 'error') logError('OUTPUT', message);
                      else if (type === 'success') logSuccess('OUTPUT', message);
                      else logInfo('OUTPUT', message);
                    }}
                  />
                </div>
              </div>

              {/* Logs screen */}
              <div
                className={`absolute inset-0 transition-opacity duration-150 ${mobileScreen === 2 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
              >
                <div className="w-full h-full p-4 border-l border-metal flex flex-col bg-card/20">
                  <LogPanel logs={logs} onClear={clearLogs} />
                </div>
              </div>
            </div>

            {/* Mobile Footer - Always Visible */}
            <footer className="shrink-0 bg-plate border-t border-metal py-2 px-4">
              <div className="flex items-center justify-between text-[10px] text-muted">
                <span>© 2026 John Huikku</span>
                <div className="flex items-center gap-3">
                  <a
                    href="https://www.ALIENROBOT.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-info transition-colors font-medium"
                  >
                    ALIENROBOT
                  </a>
                  <a
                    href="https://ko-fi.com/alienrobot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-warning transition-colors"
                    title="Support"
                  >
                    <Coffee size={12} />
                  </a>
                </div>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left sidebar - Workflow */}
            <div className="w-64 shrink-0 p-4 space-y-4 overflow-y-auto border-r border-metal">
              <ImageUpload
                onUpload={handleUpload}
                uploadedImage={uploadedImage}
                isUploading={status === 'uploading'}
                disabled={status === 'processing'}
              />
              <ControlPanel
                uploadedImage={uploadedImage}
                status={status}
                onGenerate={handleGenerate}
                onReset={handleReset}
                showAxes={showAxes}
                onShowAxesChange={setShowAxes}
                autoRotate={autoRotate}
                onAutoRotateChange={setAutoRotate}
                pointSize={pointSize}
                onSplatScaleChange={setPointSize}
                hasSplat={status === 'complete' && !!currentJob?.splatUrl}
              />
              <OutputsPanel
                splatPath={currentJob?.splatPath || null}
                splatUrl={currentJob?.splatUrl || null}
                jobId={currentJob?.jobId || null}
                isComplete={status === 'complete'}
                onLog={(message, type) => {
                  if (type === 'error') logError('OUTPUT', message);
                  else if (type === 'success') logSuccess('OUTPUT', message);
                  else logInfo('OUTPUT', message);
                }}
              />
            </div>

            {/* Center content - 3D Viewer */}
            <div className="flex-1 p-4 min-w-0 flex flex-col">
              {/* Viewer with spinner overlay */}
              <div className="flex-1 relative">
                <SplatViewer
                  splatUrl={currentJob?.splatUrl ? api.getFullApiUrl(currentJob.splatUrl) : undefined}
                  showAxes={showAxes}
                  autoRotate={autoRotate}
                  pointSize={pointSize}
                />
                {/* Processing Spinner Overlay */}
                {(status === 'uploading' || status === 'processing' || status === 'queued') && (
                  <div className="absolute inset-0 bg-void/80 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="text-center">
                      <div className="w-12 h-12 mx-auto mb-3 border-4 border-info border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-muted uppercase tracking-wider">
                        {status === 'uploading' ? 'Uploading...' : status === 'queued' ? 'In Queue...' : 'Processing...'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-2 pt-2 border-t border-metal/30 flex items-center justify-center gap-4 text-[10px] text-muted">
                <span>© 2026 John Huikku, Alienrobot LLC</span>
                <a
                  href="https://www.ALIENROBOT.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-info transition-colors"
                >
                  www.ALIENROBOT.com
                </a>
                <a
                  href="https://ko-fi.com/alienrobot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-warning transition-colors"
                  title="Buy me a coffee"
                >
                  <Coffee size={12} />
                  <span>Support</span>
                </a>
              </div>
            </div>

            {/* Right sidebar - Logs */}
            <div className="w-72 shrink-0 p-4 border-l border-metal flex flex-col h-full">
              <LogPanel logs={logs} onClear={clearLogs} />
            </div>
          </div>
        )}
      </main>

      {/* Usage & Cost Dashboard */}
      <StatsDashboard />
    </div >
  );
}


export default App;
