/** Bound a read without treating an unavailable response as a successful read.
 * This does not cancel the underlying SDK operation or change stored sessions. */
export function withReadTimeout<T>(read: PromiseLike<T>, milliseconds = 10000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("La lecture prend trop de temps. Réessaie.")), milliseconds);
    Promise.resolve(read).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
