// Builds the Windows installer and publishes it as a GitHub release in the public
// lithiumzaaa/rocket-launcher-releases repo, where installed copies look for updates.
// Uses the GitHub CLI's login for the token, so nothing secret is stored in the project.
//
//   1. Bump "version" in package.json (installed apps only update to a higher version)
//   2. npm run release
import { execFileSync, execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

let token
try {
  token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
} catch {
  console.error('GitHub CLI is not logged in. Run `gh auth login` first.')
  process.exit(1)
}

console.log(`Releasing Rocket Launcher v${version}…`)
const env = { ...process.env, GH_TOKEN: token }
delete env.ELECTRON_RUN_AS_NODE

execSync('npm run typecheck', { stdio: 'inherit', env })
execSync('npx electron-vite build', { stdio: 'inherit', env })
execSync('npx electron-builder --win --x64 --publish always', { stdio: 'inherit', env })
console.log(`\nPublished v${version}: https://github.com/lithiumzaaa/rocket-launcher-releases/releases/tag/v${version}`)
