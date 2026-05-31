export function Skeleton({ className = '' }) {
  return (
    <div className={`animate-pulse bg-white/5 rounded-xl ${className}`} />
  )
}

export function OTPCardSkeleton() {
  return (
    <div className="card-dark p-4 flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <Skeleton className="h-3 w-12 rounded-full" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
      <Skeleton className="h-12 w-4/5 mx-auto rounded-xl" />
      <Skeleton className="h-1.5 rounded-full" />
      <div className="flex justify-between">
        <Skeleton className="h-3 w-24 rounded-full" />
        <Skeleton className="h-3 w-10 rounded-full" />
      </div>
      <Skeleton className="h-3 w-3/5 rounded-full" />
      <Skeleton className="h-10 rounded-xl mt-1" />
    </div>
  )
}

export function ListRowSkeleton() {
  return (
    <div className="card-dark px-4 py-3.5 flex items-center gap-3">
      <Skeleton className="w-2 h-2 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-48 rounded-full" />
        <Skeleton className="h-2.5 w-32 rounded-full" />
      </div>
      <Skeleton className="h-7 w-14 rounded-lg flex-shrink-0" />
    </div>
  )
}

export function UserCardSkeleton() {
  return (
    <div className="card-dark px-4 sm:px-5 py-3.5 sm:py-4 flex items-center gap-3">
      <Skeleton className="w-2.5 h-2.5 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-4 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-48 rounded-full" />
      </div>
      <Skeleton className="h-6 w-4 rounded flex-shrink-0" />
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="card-dark p-4 sm:p-5 flex flex-col items-center gap-2">
      <Skeleton className="h-9 w-14 rounded-xl" />
      <Skeleton className="h-3 w-20 rounded-full" />
    </div>
  )
}
