import {useEffect, useState} from 'react';

type ToastMessage = {id: number; text: string; color?: string};

const DURATION = 1800;

let listener: ((message: ToastMessage) => void) | null = null;
let counter = 0;

export const toast = (text: string, color?: string) => listener?.({id: ++counter, text, color});

/** Run an action and report success or failure in a toast. */
export const attempt = async (action: () => Promise<unknown>, success?: string, color?: string) => {
  try {
    await action();
    if (success) toast(success, color);
  } catch (error) {
    toast(`😩 ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const Toaster = () => {
  const [current, setCurrent] = useState<ToastMessage | null>(null);

  useEffect(() => {
    listener = setCurrent;

    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;

    const timer = window.setTimeout(() => setCurrent(null), DURATION);

    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="toast" key={current.id}>
      {current.color && <span className="dot" style={{background: current.color}} />}
      {current.text}
    </div>
  );
};
