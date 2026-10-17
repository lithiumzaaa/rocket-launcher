import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'

/** Live updater state from the main process. */
export function useUpdateState(): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: 'idle' })
  useEffect(() => {
    window.api.getUpdateState().then(setState)
    return window.api.onUpdateState(setState)
  }, [])
  return state
}
