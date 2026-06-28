import { Route, Routes } from 'react-router-dom';
import Shell from './components/Shell.jsx';
import MaintenanceGate from './components/MaintenanceGate.jsx';
import Home from './pages/Home.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import ThankYou from './pages/ThankYou.jsx';
import InfoPage from './pages/InfoPage.jsx';
import { CustomerLogin, CustomerRegister } from './pages/CustomerAuth.jsx';
import Account from './pages/Account.jsx';
import AccountSettings from './pages/AccountSettings.jsx';
import Login from './admin/Login.jsx';
import AdminLayout from './admin/AdminLayout.jsx';
import Dashboard from './admin/Dashboard.jsx';
import Orders from './admin/Orders.jsx';
import OrderDetail from './admin/OrderDetail.jsx';
import CartSessions from './admin/CartSessions.jsx';
import Products from './admin/Products.jsx';
import ProductEditor from './admin/ProductEditor.jsx';
import ProductCountdown from './admin/ProductCountdown.jsx';
import Collections from './admin/Collections.jsx';
import Inventory from './admin/Inventory.jsx';
import Customers from './admin/Customers.jsx';
import Discounts from './admin/Discounts.jsx';
import DiscountDetail from './admin/DiscountDetail.jsx';
import Banners from './admin/Banners.jsx';
import Settings from './admin/Settings.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<MaintenanceGate><Shell /></MaintenanceGate>}>
        <Route path="/" element={<Home />} />
        <Route path="/product/:slug" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/thank-you" element={<ThankYou />} />
        <Route path="/login" element={<CustomerLogin />} />
        <Route path="/register" element={<CustomerRegister />} />
        <Route path="/account" element={<Account />} />
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/faq" element={<InfoPage title="Frequently asked questions" pageKey="faq" />} />
        <Route path="/shipping-returns" element={<InfoPage title="Shipping & returns" pageKey="shippingReturns" />} />
        <Route path="/terms" element={<InfoPage title="Terms of service" pageKey="terms" />} />
      </Route>
      <Route path="/checkout" element={<MaintenanceGate><Checkout /></MaintenanceGate>} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/draft" element={<CartSessions status="draft" />} />
        <Route path="orders/abandoned-checkout" element={<CartSessions status="abandoned_checkout" />} />
        <Route path="orders/:orderNumber" element={<OrderDetail />} />
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
      </Route>
      <Route path="*" element={<MaintenanceGate><Shell /></MaintenanceGate>} />
    </Routes>
  );
}
