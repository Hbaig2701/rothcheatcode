import { redirect } from 'next/navigation'

// Redirect to main admin page which has the advisors table
export default function AdvisorsPage() {
  redirect('/admin')
}
