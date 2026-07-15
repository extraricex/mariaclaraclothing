import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import PageTransition from './components/PageTransition.jsx';
import MaintenanceGate from './components/MaintenanceGate.jsx';
import Home from './pages/Home.jsx';
import ProductCountdown from './admin/ProductCountdown.jsx';
import PancakePos from './admin/PancakePos.jsx';

const Product = lazy(() => import('./pages/Product.jsx'));
const Collection = lazy(() => import('./pages/Collection.jsx'));
const Shop = lazy(() => import('./pages/Shop.jsx'));
const Cart = lazy(() => import('./pages/Cart.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const CheckoutReview = lazy(() => import('./pages/CheckoutReview.jsx'));
const ThankYou = lazy(() => import('./pages/ThankYou.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const InfoPage = lazy(() => import('./pages/InfoPage.jsx'));
const Contact = lazy(() => import('./pages/Contact.jsx'));
const SizeChart = lazy(() => import('./pages/SizeChart.jsx'));
const CustomerLogin = lazy(() => import('./pages/CustomerAuth.jsx').then((module) => ({ default: module.CustomerLogin })));
const CustomerRegister = lazy(() => import('./pages/CustomerAuth.jsx').then((module) => ({ default: module.CustomerRegister })));
const Account = lazy(() => import('./pages/Account.jsx'));
const AccountSettings = lazy(() => import('./pages/AccountSettings.jsx'));
const Login = lazy(() => import('./admin/Login.jsx'));
const AdminLayout = lazy(() => import('./admin/AdminLayout.jsx'));
const Dashboard = lazy(() => import('./admin/Dashboard.jsx'));
const Orders = lazy(() => import('./admin/Orders.jsx'));
const OrderDetail = lazy(() => import('./admin/OrderDetail.jsx'));
const CartSessions = lazy(() => import('./admin/CartSessions.jsx'));
const Products = lazy(() => import('./admin/Products.jsx'));
const ProductEditor = lazy(() => import('./admin/ProductEditor.jsx'));
const Collections = lazy(() => import('./admin/Collections.jsx'));
const Inventory = lazy(() => import('./admin/Inventory.jsx'));
const Customers = lazy(() => import('./admin/Customers.jsx'));
const Discounts = lazy(() => import('./admin/Discounts.jsx'));
const DiscountDetail = lazy(() => import('./admin/DiscountDetail.jsx'));
const Banners = lazy(() => import('./admin/Banners.jsx'));
const Settings = lazy(() => import('./admin/Settings.jsx'));
const IssueReports = lazy(() => import('./admin/IssueReports.jsx'));
const Payments = lazy(() => import('./admin/Payments.jsx'));
const Reviews = lazy(() => import('./admin/Reviews.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" aria-label="Loading page" />}>
      <Routes>
      <Route element={<MaintenanceGate><Shell /></MaintenanceGate>}>
        <Route path="/" element={<Home />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/collections/:slug" element={<Collection />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/login" element={<CustomerLogin />} />
        <Route path="/register" element={<CustomerRegister />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/faq" element={<InfoPage title="Frequently asked questions" pageKey="faq" />} />
        <Route path="/shipping-returns" element={<InfoPage title="Shipping & returns" pageKey="shippingReturns" />} />
        <Route path="/terms" element={<InfoPage title="Terms of service" pageKey="terms" />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/size-chart" element={<SizeChart />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/checkout" element={<MaintenanceGate><PageTransition><Checkout /></PageTransition></MaintenanceGate>} />
      <Route path="/checkout/review" element={<MaintenanceGate><PageTransition><CheckoutReview /></PageTransition></MaintenanceGate>} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/draft" element={<CartSessions status="draft" />} />
        <Route path="orders/abandoned-checkout" element={<CartSessions status="abandoned_checkout" />} />
        <Route path="orders/:orderNumber" element={<OrderDetail />} />
        <Route path="payments" element={<Payments />} />
        <Route path="reviews" element={<Reviews />} />
        <Route path="reviews/import" element={<Reviews />} />
        <Route path="reviews/settings" element={<Reviews />} />
        <Route path="products" element={<Products />} />
        <Route path="products/countdown" element={<ProductCountdown />} />
        <Route path="products/:slug" element={<ProductEditor />} />
        <Route path="collections" element={<Collections />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="customers" element={<Customers />} />
        <Route path="discounts" element={<Discounts />} />
        <Route path="discounts/:code" element={<DiscountDetail />} />
        <Route path="banners" element={<Banners />} />
        <Route path="settings" element={<Settings />} />
        <Route path="pancake" element={<PancakePos />} />
        <Route path="issue-reports" element={<IssueReports />} />
      </Route>
      </Routes>
    </Suspense>
  );
}
