import { AppCard } from './AppCard';
import { useRecentlyOpened } from '../hooks/useRecentlyOpened';

export function RecentlyOpened() {
  const { recentApps } = useRecentlyOpened();

  if (recentApps.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-white/60 text-sm font-medium mb-4 uppercase tracking-wider">
        Recently Opened
      </h2>
      
      <div className="flex gap-4 overflow-x-auto pb-4">
        {recentApps.map(app => (
          <div key={app.id} className="flex-shrink-0">
            <AppCard
              app={app}
              isFocused={false}
              onFocus={() => {}}
              onSelect={() => {}}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
