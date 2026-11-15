import React from 'react';
import { X, Smartphone, Download, CheckCircle2, Cpu, ShieldCheck } from 'lucide-react';

interface AndroidAppModalProps {
  isOpen: boolean;
  isStandalone: boolean;
  canPromptInstall: boolean;
  onClose: () => void;
  onTriggerInstallPrompt: () => Promise<void>;
}

export const AndroidAppModal: React.FC<AndroidAppModalProps> = ({
  isOpen,
  isStandalone,
  canPromptInstall,
  onClose,
  onTriggerInstallPrompt,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="android-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="glass-panel w-full max-w-lg rounded-3xl border border-amber-500/35 p-6 text-[#f5efe6] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 id="android-modal-title" className="font-display text-lg font-bold text-white">
                MaxVinyFy Android App
              </h2>
              <p className="text-xs text-white/60">
                Standalone Android App (`com.maxvinyfy.retroplayer`) · Thermal-Optimized
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Android App Modal"
            className="hifi-btn text-white/80"
          >
            <X strokeWidth={1.75} className="hifi-icon" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {/* Primary 1-Tap Android Install Card */}
          <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-black/40 border border-amber-500/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                {isStandalone ? 'Running as Installed Android App' : 'Install Direct to Android Home Screen'}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" /> WebAPK + Capacitor Ready
              </span>
            </div>

            {isStandalone ? (
              <div className="flex items-center gap-2.5 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3.5 py-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>MaxVinyFy is currently running in full-screen standalone Android mode.</span>
              </div>
            ) : canPromptInstall ? (
              <button
                id="trigger-native-android-install"
                type="button"
                onClick={onTriggerInstallPrompt}
                className="w-full py-3 px-4 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#12100e] font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-[transform,opacity] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Install MaxVinyFy Android App Now
              </button>
            ) : (
              <div className="space-y-2 text-xs text-white/80 leading-relaxed">
                <p className="font-medium text-white">
                  Install as a standalone Android app on your phone or car head-unit:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-white/70">
                  <li>
                    Open this published URL in <strong className="text-white">Chrome on Android</strong>.
                  </li>
                  <li>
                    Tap the browser menu <strong className="text-white">(⋮)</strong> and tap{' '}
                    <strong className="text-amber-300">&ldquo;Install app&rdquo;</strong> (or &ldquo;Add to Home screen&rdquo;).
                  </li>
                  <li>
                    Android compiles and installs the standalone <strong className="text-white">MaxVinyFy WebAPK</strong> with full-screen landscape &amp; portrait support and zero browser bars.
                  </li>
                </ol>
              </div>
            )}
          </div>

          {/* Native Android APK Build (Capacitor) & Thermal Optimization Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <Cpu className="w-4 h-4" />
                Low-Heat GPU Engine
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Hardware-composited vinyl spin, zero 60fps React re-renders, and automatic idle sleep keep your phone &amp; PC cool.
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Smartphone className="w-4 h-4" />
                Native APK Project Included
              </div>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Includes <code className="text-white/80">capacitor.config.json</code> &amp;{' '}
                <code className="text-white/80">AndroidManifest.xml</code> (<code className="text-white/80">com.maxvinyfy.retroplayer</code>) for Android Studio APK builds.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
