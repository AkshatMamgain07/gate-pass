import PDFDocument from 'pdfkit'
import { createClient } from '@supabase/supabase-js'
import { getAuthedRequestProfile, canAccessPass } from '@/lib/auth'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const profile = await getAuthedRequestProfile(req)
    if (!profile) {
        return new Response('Unauthorized — please log in again.', { status: 401 })
    }

    const { data: pass, error } = await supabase
        .from('gate_passes')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !pass) {
        return new Response('Gate pass not found', { status: 404 })
    }

    if (!canAccessPass(profile, pass)) {
        return new Response('Forbidden — you do not have access to this gate pass.', { status: 403 })
    }

    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))

    doc.fontSize(20).text('MATERIAL GATE PASS', { align: 'center' })
    doc.moveDown()

    doc.fontSize(12)
    doc.text(`Pass Number: ${pass.pass_number}`)
    doc.text(`Type: ${pass.type === 'returnable' ? 'RETURNABLE' : 'NON-RETURNABLE'}`)
    doc.text(`Date: ${new Date(pass.created_at).toLocaleDateString('en-IN')}`)
    doc.moveDown()

    doc.text(`Department: ${pass.department}`)
    doc.text(`From: ${pass.from_location || 'N/A'}    To: ${pass.to_location || 'N/A'}`)
    doc.text(`Vendor: ${pass.vendor_name || 'N/A'}`)
    doc.text(`Vehicle: ${pass.vehicle_number}`)
    doc.text(`Driver: ${pass.driver_name}`)
    doc.text(`Driver Phone: ${pass.driver_phone}`)
    if (pass.type === 'returnable' && pass.expiry_date) {
        doc.text(`Valid Until (Must Return By): ${new Date(pass.expiry_date).toLocaleDateString('en-IN')}`)
    }
    doc.moveDown()

    doc.fontSize(14).text('Materials:', { underline: true })
    doc.fontSize(12)
    pass.materials.forEach((m: any) => {
        const idPart = m.material_id ? ` [ID: ${m.material_id}]` : ''
        const datePart = m.date_issued ? ` (Issued: ${m.date_issued})` : ''
        doc.text(`  - ${m.name}: ${m.quantity} ${m.unit} (Rs. ${m.value})${idPart}${datePart}`)
    })
    doc.moveDown()

    doc.text(`Status: ${pass.status.toUpperCase()}`)
    if (pass.approved_at) {
        doc.text(`Approved: ${new Date(pass.approved_at).toLocaleDateString('en-IN')}`)
    }
    if (pass.exited_at) {
        doc.text(`Exited Gate: ${new Date(pass.exited_at).toLocaleDateString('en-IN')}`)
    }
    if (pass.returned_at) {
        doc.text(`Returned: ${new Date(pass.returned_at).toLocaleDateString('en-IN')}`)
    }
    if (pass.rejection_reason) {
        doc.text(`Rejection Reason: ${pass.rejection_reason}`)
    }

    doc.end()

    await new Promise<void>((resolve) => {
        doc.on('end', () => resolve())
    })

    const buffer = Buffer.concat(chunks)

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="gate-pass-${pass.pass_number.replace(/\//g, '-')}.pdf"`,
        },
    })
}