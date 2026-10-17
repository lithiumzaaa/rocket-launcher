import { execFileSync } from 'node:child_process'
import os from 'node:os'

const PERSONALIZE_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'

/**
 * Acrylic needs Windows 11 22H2 (build 22621)+ and "Transparency effects" switched on.
 * With transparency off, DWM paints a flat grey instead of the blur, so we use the solid theme.
 */
export function supportsAcrylic(): boolean {
  if (process.platform !== 'win32') return false
  const build = Number(os.release().split('.')[2] ?? 0)
  return build >= 22621 && transparencyEnabled()
}

function transparencyEnabled(): boolean {
  try {
    const out = execFileSync('reg', ['query', PERSONALIZE_KEY, '/v', 'EnableTransparency'], {
      encoding: 'utf8',
      windowsHide: true
    })
    return !/EnableTransparency\s+REG_DWORD\s+0x0\b/.test(out)
  } catch {
    // Value missing means the Windows default, which is on.
    return true
  }
}
