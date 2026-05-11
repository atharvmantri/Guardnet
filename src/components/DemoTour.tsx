import { driver } from 'driver.js'
import { IconPlayerPlay } from '@tabler/icons-react'
import 'driver.js/dist/driver.css'

type DemoTourProps = {
  isActive: boolean
  onOpenReportModal: () => void
  onToggleOfflineBanner: () => void
}

const DemoTour = ({
  isActive,
  onOpenReportModal,
  onToggleOfflineBanner,
}: DemoTourProps) => {
  if (!isActive) {
    return null
  }

  const handleStart = () => {
    const tour = driver({
      showProgress: true,
      steps: [
        {
          element: '#risk-card',
          popover: {
            title: 'Risk briefing',
            description: 'This card summarizes the current risk score and AI guidance.',
          },
        },
        {
          element: '#disaster-map',
          popover: {
            title: 'Disaster map',
            description: 'Scan live layers for threats and nearby resources.',
          },
        },
        {
          element: '#report-fab',
          popover: {
            title: 'Report a hazard',
            description: 'Tap to submit a local incident report fast.',
          },
        },
        {
          element: '#guardian-panel',
          popover: {
            title: 'Guardian panel',
            description: 'Coordinate guardian volunteers and requests here.',
          },
        },
        {
          element: '#evacuation-route',
          popover: {
            title: 'Evacuation route',
            description: 'Review the safest route recommendations instantly.',
          },
        },
        {
          element: '#offline-banner-toggle',
          popover: {
            title: 'Offline banner',
            description: 'Toggle the offline status banner for training.',
          },
        },
      ],
      onHighlighted: (element) => {
        const target = element?.getAttribute('id')
        if (target === 'report-fab') {
          onOpenReportModal()
        }
        if (target === 'offline-banner-toggle') {
          onToggleOfflineBanner()
        }
      },
    })

    tour.drive()
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      className="fixed right-4 top-[64px] z-50 inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-purple-500"
    >
      <IconPlayerPlay size={16} />
      Start tour
    </button>
  )
}

export default DemoTour