import {useLayoutEffect, useRef, useState, type ReactNode} from 'react';

type MarqueeProps = {className?: string; children: ReactNode};

/** One line of text; when it does not fit, it slides back and forth so the whole of it can be read. */
export const Marquee = ({className = '', children}: MarqueeProps) => {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      if (outer.current && inner.current) setShift(Math.max(0, inner.current.scrollWidth - outer.current.clientWidth));
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);

    return () => observer.disconnect();
  }, [children]);

  const style = shift
    ? ({'--shift': `-${shift}px`, '--duration': `${Math.max(6, shift / 20)}s`} as React.CSSProperties)
    : undefined;

  return (
    <div ref={outer} className={`marquee ${className}`} style={style}>
      <span ref={inner} className={shift ? 'marquee-inner scrolling' : 'marquee-inner'}>
        {children}
      </span>
    </div>
  );
};
