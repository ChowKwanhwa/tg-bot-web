export interface SessionTest {
    id: string;
    session: string;
    status: 'valid' | 'invalid';
    username?: string;
    phone?: string;
    timestamp: string;
}
