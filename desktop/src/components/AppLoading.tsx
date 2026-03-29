interface AppLoadingProps {
  appName: string;
}

export function AppLoading({ appName }: AppLoadingProps) {
  return (
    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-white/20 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-white rounded-full animate-spin" />
      </div>
      <p className="mt-4 text-white text-lg">Opening {appName}...</p>
    </div>
  );
}
