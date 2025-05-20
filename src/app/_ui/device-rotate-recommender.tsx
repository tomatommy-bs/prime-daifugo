'use client'

import { useShouldRotate } from '@/hooks/use-should-rotate'
import { useSessionStorage } from '@mantine/hooks'
import { IconDeviceMobileRotated } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'

const modal_ID = 'device_rotate_recommender'

const DeviceRotateRecommender: React.FC = () => {
  const { shouldRotate } = useShouldRotate({})

  const [shouldShow, setShouldShow] = useSessionStorage({
    key: 'shouldShowRotateRecommender',
    defaultValue: true,
  })
  const checkboxRef = useRef<HTMLInputElement>(null)

  const handleClose = () => {
    if (checkboxRef.current?.checked) {
      setShouldShow(false)
    }
  }

  useEffect(() => {
    const dialog = document.getElementById(modal_ID) as HTMLDialogElement
    if (shouldShow && shouldRotate) {
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [shouldShow, shouldRotate])

  return (
    <dialog id={modal_ID} className="modal bg-white">
      <div className="modal-box">
        <p className="text-center text-2xl font-bold">
          RECOMMENDS :
          <br />
          横向きにしてプレイ
        </p>

        <IconDeviceMobileRotated className="animate-rotate-90-repeat" size={'10rem'} />
        <style>
          {`
            @keyframes rotate-90-repeat {
              0% { transform: rotate(0deg); }
              25% { transform: rotate(90deg); }
              50% { transform: rotate(0deg); }
              100% { transform: rotate(0deg); }
            }
            .animate-rotate-90-repeat {
              animation: rotate-90-repeat 3.0s cubic-bezier(0.4,0,0.2,1) infinite;
              display: block;
              margin: 2rem auto;
            }
          `}
        </style>

        <div className="form-control">
          <label className="label cursor-pointer justify-end space-x-2">
            <input ref={checkboxRef} type="checkbox" className="checkbox" />
            <span className="label-text">再度ページを開くまで表示しない</span>
          </label>
        </div>
        <form method="dialog" className="text-right">
          <button type="button" onClick={handleClose}>
            close
          </button>
        </form>
      </div>
    </dialog>
  )
}

export default DeviceRotateRecommender
