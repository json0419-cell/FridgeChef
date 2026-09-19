import { render } from '@testing-library/react-native';
import { ProgressRing } from '../src/shared/components/ProgressRing';

describe('model download progress ring', () => {
  it('announces the completion percentage to screen readers', async () => {
    const { getByRole } = await render(<ProgressRing accessibilityLabel="验证 BGE-M3 模型" percent={37} />);
    const ring = getByRole('progressbar', { name: '验证 BGE-M3 模型' });

    expect(ring.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 37 });
  });

  it('shows the percentage as text when a label is requested', async () => {
    const { getByText } = await render(<ProgressRing percent={37.6} showLabel size={56} />);

    expect(getByText('38%')).toBeTruthy();
  });

  it('keeps the arc inside the ring for out-of-range and complete progress', async () => {
    const { getByText, rerender } = await render(<ProgressRing percent={140} showLabel />);
    expect(getByText('100%')).toBeTruthy();

    await rerender(<ProgressRing percent={-5} showLabel />);
    expect(getByText('0%')).toBeTruthy();
  });

  it('falls back to a spinner before the first progress event arrives', async () => {
    const { queryByRole } = await render(<ProgressRing accessibilityLabel="下载中" percent={null} />);

    expect(queryByRole('progressbar')).toBeNull();
  });
});
