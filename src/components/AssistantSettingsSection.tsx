import React, { useState } from 'react';
import { Brain, Download, Trash2 } from 'lucide-react';
import { SettingButton, SettingRow, SettingSection, SettingSwitch, StatusPill } from './settings/SettingsPrimitives';
import type { useAssistantModel } from '../hooks/useAssistantModel';

type ReturnTypeAssistantModel = ReturnType<typeof useAssistantModel>;

export interface AssistantSettingsProps {
  assistant: ReturnTypeAssistantModel;
}

function formatBytes(bytes: number): string {
  const megabytes = Math.round(bytes / 1_000_000);
  return `${megabytes || '<1'} MB (about ${Math.ceil(bytes / 1_048_576)} MiB)`;
}

export const AssistantSettingsSection: React.FC<AssistantSettingsProps> = ({ assistant }) => {
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const progress = assistant.progress;
  const percent = progress ? Math.min(100, Math.floor(progress.loaded / progress.total * 100)) : 0;
  return (
    <SettingSection
      id="settings-local-assistant"
      title="MINA"
      icon={Brain}
      description="Optional on-device AI assistant. Model inference and saved chats stay on this device; this does not make the rest of MINARTH work offline."
      badge={assistant.enabled ? <StatusPill tone="emerald">Enabled</StatusPill> : undefined}
    >
      <SettingRow label="Use MINA" description="No MINA prompts, chat or reports are sent to Supabase or external AI services." htmlFor="sw-local-assistant">
        <SettingSwitch id="sw-local-assistant" label="Use MINA" checked={assistant.enabled}
          disabled={!assistant.ready || !assistant.supported || !assistant.installed || assistant.busy}
          onChange={assistant.setEnabled} />
      </SettingRow>
      <SettingRow label={assistant.installed ? 'Model downloaded' : 'Download model'}
        description={`Qwen2.5-0.5B-Instruct, stored on this device. Requires about ${formatBytes(assistant.storageBytes)}; download happens only when you choose Install.`}
        stacked>
        {!assistant.installed && !assistant.busy && (
          <SettingButton icon={Download} variant="primary" disabled={!assistant.ready || !assistant.supported} onClick={() => void assistant.install()}>Download and install</SettingButton>
        )}
        {assistant.busy && !progress && <p role="status" className="text-xs text-content-2">Preparing model storage…</p>}
        {progress && (
          <div className="space-y-2" aria-live="polite">
            <progress className="w-full accent-red-600" max={progress.total} value={progress.loaded} aria-label={`Downloading local AI model: ${percent}%`} />
            <p className="text-xs text-content-2">Downloading and verifying: {percent}% ({formatBytes(progress.loaded)} / {formatBytes(progress.total)})</p>
            <SettingButton onClick={() => void assistant.cancelInstall()}>Cancel download</SettingButton>
          </div>
        )}
        {assistant.installed && !assistant.busy && !confirmRemoval && (
          <SettingButton icon={Trash2} variant="danger" onClick={() => setConfirmRemoval(true)}>Remove downloaded model</SettingButton>
        )}
        {confirmRemoval && (
          <div className="space-y-2 rounded-xl border border-red-300 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-950/20">
            <p className="text-xs text-content-2">This disables MINA and removes its downloaded model. Consented saved chats and reports remain on this device. Use Clear chats inside MINA before removing the model to delete them.</p>
            <div className="flex gap-2">
              <SettingButton variant="danger" onClick={() => { setConfirmRemoval(false); void assistant.remove(); }}>Remove model</SettingButton>
              <SettingButton onClick={() => setConfirmRemoval(false)}>Keep model</SettingButton>
            </div>
          </div>
        )}
      </SettingRow>
      <p className="py-2 text-[10px] leading-relaxed text-content-3">
        Financial records—including any categories you apply—continue to sync to your private Supabase account under the existing sync behavior. Local AI processing does not change that.
      </p>
      <p className="py-2 text-[10px] leading-relaxed text-content-3">
        Do not enter passwords, codes, account numbers or other private details. MINA masks some detected identifiers and blocks some secrets, but detection is not guaranteed. Transaction descriptions and category names may still reach the local model.
      </p>
      <p className="py-2 text-[10px] leading-relaxed text-content-3">
        Notification Add matches your Category reply first, or Description when Category is blank. While MINA is enabled, unfamiliar wording may be processed locally even when the app is closed or locked. Clear matches use shared local rules; disabling MINA keeps those rules available.
      </p>
      {assistant.error && <p role="alert" className="py-2 text-xs text-red-600 dark:text-red-400">{assistant.error}</p>}
      {assistant.ready && !assistant.installed && !assistant.error && (
        <p className="py-2 text-[10px] text-content-3">The model is not installed. MINA remains unavailable until you explicitly download it.</p>
      )}
    </SettingSection>
  );
};

