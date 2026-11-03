import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './index.js';

const meta = {
  title: 'Foundations/Button',
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { children: 'Join meeting' },
};
