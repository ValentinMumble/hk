import {execFile} from 'node:child_process';

/**
 * Restarts Volumio's player and its AirPlay receiver. This clears an AirPlay session left "playing" after the phone
 * that sent it went away, which otherwise keeps Volumio from playing anything else. Volumio lets its own user, which
 * runs the agent, use systemctl through sudo with no password; anywhere else this fails with sudo's error.
 */
export const restartVolumio = () =>
  new Promise<void>((resolve, reject) => {
    execFile('sudo', ['-n', 'systemctl', 'restart', 'shairport-sync', 'volumio'], {timeout: 90_000}, error =>
      error ? reject(new Error(`Volumio restart failed: ${error.message}`)) : resolve(),
    );
  });
