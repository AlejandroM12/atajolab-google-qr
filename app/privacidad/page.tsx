import type { Metadata } from "next";
import { LegalPage, LegalSection, LegalValue } from "@/components/legal-page";
import { legal } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos usa AtajoLab, para qué y cómo ejercer tus derechos.",
  alternates: { canonical: "/privacidad" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidad"
      intro={<p>Usamos los datos mínimos para preparar tu diseño, cobrarlo y entregarte los archivos.</p>}
    >
      <LegalSection title="Responsable">
        <p>
          <LegalValue value={legal.legalName} />, con base en <LegalValue value={legal.publicLocation} /> (ciudad
          y provincia, no es un domicilio). CUIT <LegalValue value={legal.taxId} />. Domicilio legal:{" "}
          <LegalValue value={legal.address} />. Contacto: <LegalValue value={legal.supportEmail} />.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos usamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Correo electrónico</strong> que dejás al comprar: para enviarte el acceso y para recuperar tus
            descargas.
          </li>
          <li>
            <strong>Tu diseño</strong>: textos, colores, las imágenes que subas y el contenido del código QR (el
            enlace, los datos de la red Wi-Fi con su contraseña, los datos de contacto o el texto que cargues). Se
            guarda con el pedido para poder generar tus archivos cada vez que los descargues. Lo que no es un enlace
            (Wi-Fi, contacto o texto) se guarda cifrado. Mientras armás el diseño, queda solo en tu navegador hasta
            que cerrás la pestaña.
          </li>
          <li>
            <strong>Datos del pago</strong> que informa Mercado Pago: número de operación, estado y monto. No
            recibimos datos de tarjetas.
          </li>
          <li>
            <strong>Datos técnicos</strong> para seguridad: registros de errores sin datos personales y, para limitar
            abusos, un código derivado de tu conexión (hash) que se borra solo. No guardamos tu dirección IP.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Usamos solo cookies necesarias: una para tu borrador en el editor y otra que te da acceso a tu pedido en este
          navegador. No usamos cookies de publicidad. Si se activa la medición de visitas, es una herramienta sin
          cookies que no identifica personas.
        </p>
      </LegalSection>

      <LegalSection title="Con quién se comparten">
        <p>Solo con los proveedores que hacen funcionar el servicio:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Mercado Pago, para procesar el pago.</li>
          <li>Resend, para enviar los correos.</li>
          <li>Render y Neon, para alojar el sitio y la base de datos.</li>
        </ul>
        <p>
          Algunos de estos proveedores pueden tener servidores fuera de Argentina. No vendemos tus datos ni los usamos
          para publicidad.
        </p>
      </LegalSection>

      <LegalSection title="Cuánto tiempo los guardamos">
        <p>
          <LegalValue value={legal.dataRetention} />
        </p>
        <p>Las imágenes de borradores que no se compran se borran automáticamente a las 48 horas.</p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <p>
          Podés pedir acceso, rectificación o supresión de tus datos escribiendo a{" "}
          <LegalValue value={legal.supportEmail} />, según la Ley 25.326 de Protección de Datos Personales. Respondemos
          los pedidos de acceso dentro de los 10 días corridos y los de rectificación o supresión dentro de los 5 días
          hábiles, como fija esa ley. La Agencia
          de Acceso a la Información Pública es el órgano de control de esa ley y recibe denuncias por incumplimientos.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
