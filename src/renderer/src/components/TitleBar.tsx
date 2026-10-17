/** Drag strip. Right side stays clear for the native caption buttons (titleBarOverlay). */
export function TitleBar(): JSX.Element {
  return (
    <header className="drag relative flex h-10 shrink-0 items-center justify-center">
      <span className="text-xs font-medium tracking-wide text-ink-faint">Rocket Launcher</span>
    </header>
  )
}
