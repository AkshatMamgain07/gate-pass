import PDFDocument from 'pdfkit'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const { data: pass, error } = await supabase
        .from('gate_passes')
        .select('*')
        .eq('id', id)
        .single()

    if (error || !pass) {
        return new Response('Gate pass not found', { status: 404 })
    }

    const doc = new PDFDocument({ margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk) => chunks.push(chunk))

    doc.fontSize(20).text('MATERIAL GATE PASS', { align: 'center' })
    doc.moveDown()

    doc.fontSize(12)
    doc.text(`Pass Number: ${pass.pass_number}`)
    doc.text(`Type: ${pass.type.toUpperCase()}`)
    doc.text(`Date: ${new Date(pass.created_at).toLocaleDateString('en-IN')}`)
    doc.moveDown()

    doc.text(`Department: ${pass.department}`)
    doc.text(`Vendor: ${pass.vendor_name || 'N/A'}`)
    doc.text(`Vehicle: ${pass.vehicle_number}`)
    doc.text(`Driver: ${pass.driver_name}`)
    doc.text(`Driver Phone: ${pass.driver_phone}`)
    doc.moveDown()

    doc.fontSize(14).text('Materials:', { underline: true })
    doc.fontSize(12)
    pass.materials.forEach((m: any) => {
        doc.text(`  - ${m.name}: ${m.quantity} ${m.unit} (Rs. ${m.value})`)
    })
    doc.moveDown()

    doc.text(`Status: ${pass.status.toUpperCase()}`)
    if (pass.approved_at) {
        doc.text(`Approved: ${new Date(pass.approved_at).toLocaleDateString('en-IN')}`)
    }
    if (pass.verified_at) {
        doc.text(`Verified: ${new Date(pass.verified_at).toLocaleDateString('en-IN')}`)
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