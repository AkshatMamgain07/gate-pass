import { Html, Head, Body, Container, Heading, Text, Button } from '@react-email/components'

interface NotificationProps {
    type: 'created' | 'approved' | 'rejected'
    passNumber: string
    recipientName: string
    url: string
}

const titles: Record<string, string> = {
    created: 'New Gate Pass Awaiting Approval',
    approved: 'Gate Pass Approved',
    rejected: 'Gate Pass Rejected',
}

export function GatePassNotification({ type, passNumber, recipientName, url }: NotificationProps) {
    return (
        <Html>
            <Head />
            <Body style={{ fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f4f5' }}>
                <Container style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '12px', margin: '40px auto', maxWidth: '500px' }}>
                    <Heading style={{ color: '#1e293b', fontSize: '20px' }}>{titles[type]}</Heading>
                    <Text style={{ color: '#475569', fontSize: '14px' }}>Dear {recipientName},</Text>
                    <Text style={{ color: '#475569', fontSize: '14px' }}>Gate Pass Number: <strong>{passNumber}</strong></Text>
                    <Button
                        href={url}
                        style={{ backgroundColor: '#2563eb', color: '#ffffff', padding: '12px 24px', borderRadius: '8px', textDecoration: 'none', fontSize: '14px', display: 'inline-block', marginTop: '16px' }}
                    >
                        View Details
                    </Button>
                </Container>
            </Body>
        </Html>
    )
}