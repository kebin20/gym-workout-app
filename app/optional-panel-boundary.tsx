'use client';
import { Component, type ReactNode } from 'react';
export default class OptionalPanelBoundary extends Component<
  { children: ReactNode; message: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="mt-3 text-sm text-muted-foreground" role="alert">
        {this.props.message}
      </p>
    ) : (
      this.props.children
    );
  }
}
