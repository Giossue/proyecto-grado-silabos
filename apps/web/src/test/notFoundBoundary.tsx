import { Component, type ReactNode } from "react"

/** Stands in for Next's not-found boundary: `test/nextNavigation` throws `not-found`. */
export class NotFoundBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.state.error.message !== "not-found") throw this.state.error

    return <p data-testid="not-found">404</p>
  }
}
