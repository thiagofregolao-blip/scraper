
import ProductScraperApp from "./_components/product-scraper-app";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent mb-4">
            Product Scraper
          </h1>
          <p className="text-lg md:text-xl text-gray-700 max-w-3xl mx-auto">
            Extraia produtos de categorias de e-commerce automaticamente com imagens e descrições completas
          </p>
        </div>
        
        <div className="max-w-4xl mx-auto">
          <ProductScraperApp />
        </div>
      </div>
    </div>
  );
}
