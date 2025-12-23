import { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { ImageUpload } from './components/ImageUpload';
import { ControlPanel } from './components/ControlPanel';
import { OutputsPanel } from './components/OutputsPanel';
import { SplatViewer } from './components/SplatViewer';
import { LogPanel, useLogs } from './components/LogPanel';
import { DocsModal } from './components/DocsModal';
import * as api from './services/api';
import type { JobStatus, ImageUploadResponse, SplatJob } from './types';

function App() {
  const [status, setStatus] = useState<JobStatus>('idle');
  const [uploadedImage, setUploadedImage] = useState<ImageUploadResponse | null>(null);
  const [currentJob, setCurrentJob] = useState<SplatJob | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [backendOnline, setBackendOnline] = useState(false);
  const { logs, clearLogs, logError, logSuccess, logInfo } = useLogs();

  // View settings state
  const [pointSize, setPointSize] = useState(0.005);
  const [showColors, setShowColors] = useState(true);
  const [pointShape, setPointShape] = useState<'square' | 'circle'>('circle');

  // Docs modal state
  const [isDocsOpen, setIsDocsOpen] = useState(false);

  // Check backend health on mount (reduced frequency to avoid rate limits)
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const online = await api.healthCheck();
        setBackendOnline(online);
      } catch {
        // 429 = rate limited but server is responding, so still "online"
        // Only mark offline if completely unreachable
        setBackendOnline(false);
      }
    };
    checkHealth();
    // Check every 30 seconds to avoid rate limiting
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);


  const handleUpload = useCallback(async (file: File) => {
    setStatus('uploading');
    setError(undefined);
    logInfo('UPLOAD', `Uploading ${file.name}...`);

    try {
      const response = await api.uploadImage(file);
      setUploadedImage(response);
      setStatus('idle');
      logSuccess('UPLOAD', `Image uploaded: ${response.filename} (${response.width}×${response.height})`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      setError(errorMsg);
      setStatus('error');
      logError('UPLOAD ERROR', errorMsg);
    }
  }, [logError, logSuccess, logInfo]);

  const handleGenerate = useCallback(async () => {
    if (!uploadedImage) return;

    setStatus('processing');
    setError(undefined);
    logInfo('INFERENCE', 'Starting 3D Gaussian splat generation...');

    try {
      const job = await api.generateSplat(uploadedImage.imageId);
      setCurrentJob(job);

      // Log initial status (might be queued)
      if (job.status === 'queued' && job.queuePosition) {
        setStatus('queued');
        logInfo('QUEUE', `Position #${job.queuePosition} - estimated wait: ${job.estimatedWaitSeconds || 0}s`);
      } else {
        logInfo('INFERENCE', `Job started: ${job.jobId}`);
      }

      // Poll for completion
      const pollInterval = setInterval(async () => {
        try {
          const updatedJob = await api.getSplatStatus(job.jobId);
          setCurrentJob(updatedJob);

          // Update status based on job state
          if (updatedJob.status === 'queued') {
            setStatus('queued');
          } else if (updatedJob.status === 'processing') {
            setStatus('processing');
          }

          if (updatedJob.status === 'complete') {
            clearInterval(pollInterval);
            setStatus('complete');
            logSuccess('INFERENCE', `Complete in ${(updatedJob.processingTimeMs || 0) / 1000}s`);
          } else if (updatedJob.status === 'error') {
            clearInterval(pollInterval);
            setStatus('error');
            setError(updatedJob.error);
            logError('INFERENCE', updatedJob.error || 'Generation failed');
          }
        } catch (pollErr) {
          clearInterval(pollInterval);
          setStatus('error');
          const errorMsg = pollErr instanceof Error ? pollErr.message : 'Failed to check job status';
          setError(errorMsg);
          logError('CONNECTION', errorMsg);
        }
      }, 2000); // Poll every 2 seconds
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
  }, [logInfo]);

  return (
    <div className="h-screen bg-void flex flex-col overflow-hidden">
      <Header
        status={status}
        processingTime={currentJob?.processingTimeMs}
        error={error}
        backendOnline={backendOnline}
        onDocsClick={() => setIsDocsOpen(true)}
        currentJob={currentJob}
      />


      {/* Documentation Modal */}
      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      <main className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Upload, Controls & Outputs */}
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
            pointSize={pointSize}
            onPointSizeChange={setPointSize}
            showColors={showColors}
            onShowColorsChange={setShowColors}
            pointShape={pointShape}
            onPointShapeChange={setPointShape}
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

        {/* Center content - 3D Viewer (fills remaining space) */}
        <div className="flex-1 p-4 min-w-0">
          <SplatViewer
            splatUrl={currentJob?.splatUrl ? api.getFullApiUrl(currentJob.splatUrl) : undefined}
            showAxes={true}
            autoRotate={false}
            pointSize={pointSize}
            showColors={showColors}
            pointShape={pointShape}
          />
        </div>

        {/* Right sidebar - Logs (full height) */}
        <div className="w-72 shrink-0 p-4 border-l border-metal flex flex-col h-full">
          <LogPanel logs={logs} onClear={clearLogs} />
        </div>
      </main>

    </div>
  );
}

export default App;
