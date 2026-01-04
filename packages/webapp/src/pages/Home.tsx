export default function Home() {
  return (
    <div style={{
      textAlign: 'center',
      padding: '3rem',
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '12px',
      boxShadow: '0 0 30px rgba(0, 0, 0, 0.5)'
    }}>
      <h2 style={{
        fontSize: '2.5rem',
        marginBottom: '1rem',
        color: '#00f7c2',
        textShadow: '0 0 20px rgba(0, 247, 194, 0.5)'
      }}>
        הסוד – מנוי לרמיקסים
      </h2>
      <p style={{
        fontSize: '1.4rem',
        color: '#e0e0e0',
        marginBottom: '2rem',
        fontWeight: '500'
      }}>
        קבלו גישה לרמיקסים הכי חזקים בעולם
      </p>
      <p style={{
        fontSize: '2rem',
        color: '#00f7c2',
        marginBottom: '1rem',
        fontWeight: 'bold'
      }}>
        רק ב-69 ש"ח לחודש
      </p>
      <p style={{
        fontSize: '1.1rem',
        color: '#ccc',
        marginBottom: '2rem'
      }}>
        התחבר כדי לנהל את המנוי שלך ולקבל גישה לאוסף המוזיקה המלא
      </p>
    </div>
  );
}
