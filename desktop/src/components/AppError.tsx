interface AppErrorProps {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}

export function AppError({ message, onRetry, onClose }: AppErrorProps) {
  return (
    <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-50">
      <div className="text-center max-w-md">
        <div className="text-red-500 text-6xl mb-4">⚠</div>
        <h2 className="text-white text-2xl font-bold mb-2">Failed to Load</h2>
        <p className="text-gray-400 mb-8">{message}</p>
        
        <div className="flex gap-4 justify-center">
          <button
            onClick={onRetry}
            className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-gray-700 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
