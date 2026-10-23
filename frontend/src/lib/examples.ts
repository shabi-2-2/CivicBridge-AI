export type ExampleId = 'pothole' | 'garbage' | 'streetlight'

export type ExampleIssue = {
  id: ExampleId
  label: string
  text: string
}

export const EXAMPLE_ISSUES: readonly ExampleIssue[] = [
  {
    id: 'pothole',
    label: 'Pothole',
    text: 'There is a deep pothole on the road outside the community market. Cars swerve into the opposite lane to avoid it, and it fills with water whenever it rains.',
  },
  {
    id: 'garbage',
    label: 'Garbage',
    text: 'Garbage has been piling up beside the park gate for almost a week. Bags are splitting open and there is a strong smell in the afternoons.',
  },
  {
    id: 'streetlight',
    label: 'Broken streetlight',
    text: 'The streetlight at the corner of our lane has been dark for three nights. The pavement is hard to see and people have started walking in the road.',
  },
]
