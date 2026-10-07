export type HueState = {on?: boolean; color?: string; brightness?: number};

export type Light = {
  id: string;
  name: string;
  on: boolean;
  reachable: boolean;
  /** 0-100 */
  brightness: number;
  hasColor: boolean;
};

export type Hue = {
  lights(): Promise<Light[]>;
  /** Apply a state to every light at once (Hue group 0). */
  setAll(state: HueState): Promise<void>;
  setLight(id: string, state: HueState): Promise<void>;
  /** Flip one light and return its new on/off state. */
  toggle(id: string): Promise<boolean>;
};

export type Hk = {
  /** Send a command; resolves with the device reply for the few commands that answer. */
  send(command: string, para?: string): Promise<string | undefined>;
};

export type Devices = {hk: Hk; hue: Hue};
