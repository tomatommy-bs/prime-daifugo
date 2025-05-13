const primeMemo: Set<number> = new Set()
let maxPrimeMemo = 2
export function* primeNumberGenerator(): Generator<number, number> {
  let num = 2
  primeMemo.add(num)
  while (true) {
    let isPrime = true
    for (const prime of primeMemo) {
      if (num === prime) {
        break
      }
      if (num % prime === 0) {
        isPrime = false
        break
      }
    }
    if (isPrime) {
      primeMemo.add(num)
      maxPrimeMemo = Math.max(maxPrimeMemo, num)
      yield num
    }
    num++
  }
}

const generator = primeNumberGenerator()
Array(10 ** 4)
  .fill(null)
  .map((_) => generator.next())

export { primeMemo }

export const isPrime = (n: number): boolean => {
  if (n === 1) {
    return false
  }
  if (n <= maxPrimeMemo) {
    return primeMemo.has(n)
  }
  for (let i = 1; i <= Math.sqrt(n); i++) {
    if (n % i === 0) {
      return false
    }
  }
  return true
}
