import React, { useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { SweetAlert } from '../components/SweetAlert';
import {
  LOCATION_DISCLOSURE,
  registerLocationDisclosurePresenter,
  type LocationDisclosureContent,
} from '../services/locationDisclosure';

/**
 * Mounts the Google Play prominent location disclosure modal and registers it
 * so `locationPermissions` can await Accept/Deny before the system prompt.
 */
export function LocationDisclosureProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [content, setContent] = useState<LocationDisclosureContent>(LOCATION_DISCLOSURE);
  const [dialogKey, setDialogKey] = useState(0);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(() => {
    registerLocationDisclosurePresenter(
      (nextContent) =>
        new Promise<boolean>((resolve) => {
          // If a previous dialog was left hanging, reject it first.
          if (resolverRef.current) {
            resolverRef.current(false);
            resolverRef.current = null;
          }
          resolverRef.current = resolve;
          setContent(nextContent);
          // Force a fresh modal mount so Accept → later re-prompt always shows.
          setDialogKey((k) => k + 1);
          setVisible(true);
        }),
    );
    return () => {
      registerLocationDisclosurePresenter(null);
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  const finish = (accepted: boolean) => {
    setVisible(false);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(accepted);
  };

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish(false);
      return true;
    });
    return () => sub.remove();
  }, [visible]);

  return (
    <>
      {children}
      <SweetAlert
        key={dialogKey}
        visible={visible}
        variant="info"
        title={content.title}
        message={content.message}
        confirmText={content.acceptText}
        cancelText={content.denyText}
        onConfirm={() => finish(true)}
        onClose={() => finish(false)}
      />
    </>
  );
}
