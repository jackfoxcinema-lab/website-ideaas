import {
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Clock,
  Instagram,
  Mail,
  Menu,
  Moon,
  Pause,
  Play,
  Sun,
  Volume2,
  X,
  Youtube,
  type LucideProps,
} from "lucide-react";

/** Brand marks lucide doesn't ship. */
function Spotify(props: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.28a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.56-1.16a.75.75 0 1 1-.33-1.46c4.59-1.05 8.52-.6 11.67 1.33a.75.75 0 0 1 .25 1.04zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.54-1.8c4.36-1.32 9.78-.68 13.49 1.6a.94.94 0 0 1 .31 1.29zm.13-3.4C15.36 8.32 9 8.1 5.3 9.22a1.12 1.12 0 1 1-.65-2.15C8.9 5.78 15.92 6.04 20.2 8.58a1.12 1.12 0 0 1-1.15 1.93z" />
    </svg>
  );
}

function SoundCloud(props: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M1.2 13.2c-.1 0-.15.06-.16.15l-.2 1.9.2 1.86c.01.09.06.15.16.15.09 0 .14-.06.16-.15l.23-1.86-.23-1.9c-.02-.09-.07-.15-.16-.15zm1.2-1.05c-.1 0-.17.07-.18.17l-.25 2.93.25 2.83c.01.1.08.17.18.17.1 0 .17-.07.18-.17l.28-2.83-.28-2.93c-.01-.1-.08-.17-.18-.17zm2.43-.86c-.12 0-.21.09-.22.21l-.23 3.75.23 2.8c.01.12.1.21.22.21.12 0 .21-.09.22-.21l.26-2.8-.26-3.75c-.01-.12-.1-.21-.22-.21zm1.24.12c-.13 0-.23.1-.24.23l-.22 3.6.22 2.79c.01.13.11.23.24.23.13 0 .23-.1.24-.23l.25-2.79-.25-3.6c-.01-.13-.11-.23-.24-.23zM8.5 9.3c-.14 0-.26.12-.27.26l-.2 6.02.2 2.76c.01.14.13.26.27.26.14 0 .26-.12.27-.26l.23-2.76-.23-6.02c-.01-.14-.13-.26-.27-.26zm1.28-.7c-.16 0-.28.13-.29.29l-.19 6.71.19 2.72c.01.16.13.29.29.29.15 0 .28-.13.29-.29l.21-2.72-.21-6.71c-.01-.16-.14-.29-.29-.29zm1.32-.28c-.17 0-.3.14-.31.31l-.18 6.98.18 2.69c.01.17.14.31.31.31.17 0 .3-.14.31-.31l.2-2.69-.2-6.98c-.01-.17-.14-.31-.31-.31zm1.4 1.25c-.18 0-.33.15-.34.34l-.16 5.7.16 2.64c.01.19.16.34.34.34.18 0 .33-.15.34-.34l.18-2.64-.18-5.7c-.01-.19-.16-.34-.34-.34zm1.45-1.9c-.2 0-.35.16-.36.36l-.15 7.24.15 2.6c.01.2.16.36.36.36.2 0 .35-.16.36-.36l.17-2.6-.17-7.24c-.01-.2-.16-.36-.36-.36zm1.62.35a.39.39 0 0 0-.38.38l-.14 6.87.14 2.57a.39.39 0 0 0 .38.38.39.39 0 0 0 .38-.38l.16-2.57-.16-6.87a.39.39 0 0 0-.38-.38zM17.1 6.4a.41.41 0 0 0-.4.4l-.13 9.22.13 2.54c0 .22.18.4.4.4.22 0 .4-.18.4-.4l.14-2.54-.14-9.22a.41.41 0 0 0-.4-.4zm2.3 3.3c-.3-.13-.63-.2-.98-.2-.25 0-.5.04-.72.11a.2.2 0 0 0-.15.2v8.65c0 .11.08.2.19.21l3.53.01c1.95 0 3.53-1.58 3.53-3.53 0-1.95-1.58-3.53-3.53-3.53-.48 0-.94.1-1.36.27a4.12 4.12 0 0 0-.51-2.19z" />
    </svg>
  );
}

/** A small animated equalizer shown on the currently playing track. */
function Equalizer({ className, ...props }: LucideProps) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4}
          y={1}
          width={2}
          height={10}
          rx={1}
          fill="currentColor"
          className="origin-center animate-bar-pulse"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </svg>
  );
}

export const Icons = {
  instagram: Instagram,
  youtube: Youtube,
  spotify: Spotify,
  soundcloud: SoundCloud,
  mail: Mail,
  play: Play,
  pause: Pause,
  volume: Volume2,
  menu: Menu,
  close: X,
  sun: Sun,
  moon: Moon,
  arrowUpRight: ArrowUpRight,
  arrowLeft: ArrowLeft,
  calendar: Calendar,
  clock: Clock,
  equalizer: Equalizer,
};

export type IconName = keyof typeof Icons;
