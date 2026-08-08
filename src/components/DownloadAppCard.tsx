import React from 'react';
import { Capacitor } from '@capacitor/core';
import { Download, Smartphone } from 'lucide-react';

// Points directly at the release *asset*, not the release page. GitHub serves
// this URL with a redirect straight to the file (Content-Disposition:
// attachment), so the browser downloads the APK immediately instead of
// navigating to github.com. The filename must match what
// .github/workflows/build-apk.yml uploads (TMF-app.apk).
const LATEST_APK_DOWNLOAD_URL = 'https://github.com/Sagar856/TMF-app/releases/latest/download/TMF-app.apk';

/**
 * Prompts web visitors to download the native Android APK. Hidden when the
 * app is already running inside the native Android shell (Capacitor), since
 * there's nothing to "download" from within the app itself.
 */
export const DownloadAppCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  if (Capacitor.getPlatform() !== 'web') return null;

  if (compact) {
    return (
      <a
        href={LATEST_APK_DOWNLOAD_URL}
        download
        className="p-2 sm:p-2.5 bg-graphite hover:bg-[#222] border border-nothing rounded-xl text-[#aaa] hover:text-white transition-colors flex items-center justify-center min-w-[38px] min-h-[38px]"
        title="Download Android App (.apk)"
      >
        <Download className="w-4 h-4 text-emerald-400" />
      </a>
    );
  }

  return (
    <a
      href={LATEST_APK_DOWNLOAD_URL}
      download
      className="p-3 bg-obsidian hover:bg-graphite border border-emerald-800/50 rounded-xl transition-all group text-left relative overflow-hidden block"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
          <Smartphone className="w-3 h-3" />
          Get Mobile App
        </span>
        <Download className="w-3.5 h-3.5 text-emerald-400" />
      </div>
      <div className="text-xs text-[#aaa] font-medium group-hover:text-white transition-colors">
        Download the Android .apk
      </div>
    </a>
  );
};
