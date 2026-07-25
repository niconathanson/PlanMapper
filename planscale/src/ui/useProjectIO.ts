// The New / Open / Save / Save as… actions, shared by the top bar, the keyboard
// shortcuts and the "unsaved changes" close guard so they can't drift apart.
//
// State is read through getState() at call time rather than by subscribing, so
// using this hook never re-renders the component that holds it.

import { useCallback } from 'react';
import { useStore } from '../core/store';
import { saveProject, openProject, clearCurrentFile } from '../core/project';

// Name offered in the Save-as dialog: the current file, else the plan image's
// name, so "venue-plan.pdf" becomes "venue-plan.planmapper".
function suggestedName(): string {
  const s = useStore.getState();
  return (
    s.fileName?.replace(/\.planmapper$/i, '') || s.image?.name?.replace(/\.[^.]+$/, '') || 'plan'
  );
}

export function useProjectIO() {
  // Returns true once the project is safely on disk (false if the user cancelled).
  const doSave = useCallback(async (saveAs = false): Promise<boolean> => {
    const s = useStore.getState();
    const name = await saveProject(s.toProject(), suggestedName(), saveAs);
    if (name === null) return false;
    s.markSaved(name);
    return true;
  }, []);

  const doOpen = useCallback(async () => {
    const s = useStore.getState();
    if (s.dirty && !confirm('Discard unsaved changes and open a project?')) return;
    const opened = await openProject();
    if (opened) {
      s.loadProject(opened.data, opened.name);
      setTimeout(() => s.requestFit(), 50);
    }
  }, []);

  const doNew = useCallback(() => {
    const s = useStore.getState();
    if (s.dirty && !confirm('Discard unsaved changes and start a new project?')) return;
    clearCurrentFile();
    s.newProject();
  }, []);

  return { doSave, doOpen, doNew };
}
