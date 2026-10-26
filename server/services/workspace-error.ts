export class WorkspaceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}
