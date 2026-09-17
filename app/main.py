import os
import uuid
import httpx
from fastapi import FastAPI, HTTPException, Query, Depends, Request
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from enum import Enum
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pwdlib import PasswordHash
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from fastapi.staticfiles import StaticFiles

from app.database import Base, engine, get_db
from app import models

load_dotenv()
PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")
password_hash = PasswordHash.recommended()

# --- SECURITY: secret key and admin credentials come from the environment ---
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY is not set. Add it to your .env file, e.g. "
        "JWT_SECRET_KEY=$(python -c \"import secrets; print(secrets.token_hex(32))\")"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# One shared scheme: both admins and customers authenticate through /login,
# and the token's "role" claim (checked in get_current_admin/get_current_customer)
# is what actually gates access — not which scheme was used.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# Only used to seed the very first admin row on first run. After that, admins
# live in the database (see the Admin model + lifespan seeding below), and
# more can be created via POST /admin/admins.
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")

# Seed data used only to populate an empty database on first run.
SEED_MEDICINES = [
    {"name": "Paracetamol", "price": 500, "description": "Pain and fever relief",
     "stock": 100, "category": "Pain Relief", "prescription_required": False},
    {"name": "Amoxicillin", "price": 3000, "description": "Antibiotic",
     "stock": 50, "category": "Antibiotics", "prescription_required": True},
    {"name": "Cetirizine", "price": 200, "description": "Allergy relief",
     "stock": 75, "category": "Allergy", "prescription_required": False},
    {"name": "Ibuprofen", "price": 400, "description": "Pain and inflammation relief",
     "stock": 60, "category": "Pain Relief", "prescription_required": False},
    {"name": "Metformin", "price": 1500, "description": "Diabetes management",
     "stock": 40, "category": "Diabetes", "prescription_required": True},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates tables if they don't exist yet. For schema changes later, switch
    # to Alembic migrations instead of relying on create_all.
    Base.metadata.create_all(bind=engine)

    db = next(get_db())
    try:
        if db.query(models.Medicine).count() == 0:
            db.add_all(models.Medicine(**m) for m in SEED_MEDICINES)
            db.commit()

        if db.query(models.Admin).count() == 0:
            if ADMIN_USERNAME and ADMIN_PASSWORD:
                db.add(models.Admin(
                    username=ADMIN_USERNAME,
                    password=password_hash.hash(ADMIN_PASSWORD),
                ))
                db.commit()
            else:
                print(
                    "WARNING: no admin account exists yet and ADMIN_USERNAME/"
                    "ADMIN_PASSWORD are not set. Set them in .env to seed the "
                    "first admin on next startup."
                )
    finally:
        db.close()

    yield


app = FastAPI(title="PharmaHub API", lifespan=lifespan)
app.mount("/frontend", StaticFiles(directory="frontend", html=True), name="frontend")


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class AdminCreate(BaseModel):
    username: str = Field(min_length=1, max_length=50)
    password: str = Field(min_length=8)


class Medicine(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    price: float = Field(gt=0)
    description: str = Field(max_length=200)
    stock: int = Field(ge=0)
    category: str = Field(min_length=1, max_length=50)
    prescription_required: bool = False


class MedicineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    price: float | None = Field(default=None, gt=0)
    description: str | None = Field(default=None, max_length=200)
    stock: int | None = Field(default=None, ge=0)
    category: str | None = Field(default=None, min_length=1, max_length=50)
    prescription_required: bool | None = Field(default=None)


class MedicineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    price: float
    description: str
    stock: int
    category: str
    prescription_required: bool = False


class CartItem(BaseModel):
    medicine_id: int
    quantity: int = Field(gt=0)


class CartUpdate(BaseModel):
    quantity: int = Field(gt=0)


class PaymentStatus(str, Enum):
    PENDING = "Pending"
    PAID = "Paid"
    FAILED = "Failed"
    REFUNDED = "Refunded"


class OrderItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    medicine_id: int
    name: str
    quantity: int
    price: float
    total_price: float


class Order(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_username: str
    items: list[OrderItem]
    total_price: float
    status: str
    payment_status: PaymentStatus = PaymentStatus.PENDING
    payment_reference: str | None = None


class OrderStatus(str, Enum):
    PENDING = "Pending"
    PROCESSING = "Processing"
    SHIPPED = "Shipped"
    DELIVERED = "Delivered"
    CANCELLED = "Cancelled"


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class Customer(BaseModel):
    username: str
    email: str
    password: str


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    username: str
    email: str


class PrescriptionStatus(str, Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    EXPIRED = "Expired"


class Prescription(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_username: str
    medicine_id: int
    doctor_name: str
    prescription_date: datetime
    expiry_date: datetime
    status: PrescriptionStatus


class PrescriptionCreate(BaseModel):
    medicine_id: int
    doctor_name: str
    prescription_date: datetime
    expiry_date: datetime


class PrescriptionStatusUpdate(BaseModel):
    status: PrescriptionStatus


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode the shared JWT and pull out the username + role claims.

    This is the single point where every request's token is validated,
    regardless of whether the caller turns out to be an admin or a customer.
    """
    credentials_exception = HTTPException(
        status_code=401, detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str | None = payload.get("sub")
        role: str | None = payload.get("role")
        if username is None or role not in ("admin", "customer"):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    return {"username": username, "role": role}


def get_current_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Admin:
    payload = decode_token(token)
    if payload["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    admin = db.query(models.Admin).filter(models.Admin.username == payload["username"]).first()
    if not admin:
        raise HTTPException(
            status_code=401, detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return admin


def get_current_customer(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.Customer:
    payload = decode_token(token)
    if payload["role"] != "customer":
        raise HTTPException(status_code=403, detail="Customer access required")

    customer = db.query(models.Customer).filter(models.Customer.username == payload["username"]).first()
    if not customer:
        raise HTTPException(
            status_code=401, detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return customer


def order_to_schema(order: models.Order) -> Order:
    return Order(
        id=order.id,
        customer_username=order.customer.username,
        items=[OrderItem.model_validate(i) for i in order.items],
        total_price=order.total_price,
        status=order.status,
        payment_status=PaymentStatus(order.payment_status),
        payment_reference=order.payment_reference,
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/")
def home():
    return {"message": "Welcome to PharmaHub"}


@app.get("/medicines", response_model=list[MedicineResponse])
def get_medicines(db: Session = Depends(get_db)):
    return db.query(models.Medicine).all()


@app.get("/medicines/search", response_model=list[MedicineResponse])
def search_medicines(
    db: Session = Depends(get_db),
    name: str | None = Query(None, min_length=1, max_length=50),
    category: str | None = Query(None, min_length=1, max_length=50),
    min_price: float | None = Query(None, ge=0),
    max_price: float | None = Query(None, ge=0),
    in_stock: bool | None = Query(None),
):
    q = db.query(models.Medicine)

    if name:
        q = q.filter(models.Medicine.name.ilike(f"%{name}%"))
    if category:
        q = q.filter(models.Medicine.category.ilike(category))
    if min_price is not None:
        q = q.filter(models.Medicine.price >= min_price)
    if max_price is not None:
        q = q.filter(models.Medicine.price <= max_price)
    if in_stock is True:
        q = q.filter(models.Medicine.stock > 0)
    if in_stock is False:
        q = q.filter(models.Medicine.stock == 0)

    return q.all()


@app.get("/cart")
def get_cart(
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    items = db.query(models.CartItem).filter(models.CartItem.customer_id == current_customer.id).all()

    cart_items = []
    total_price = 0.0
    for item in items:
        line_total = item.medicine.price * item.quantity
        cart_items.append({
            "medicine_id": item.medicine_id,
            "name": item.medicine.name,
            "quantity": item.quantity,
            "price": item.medicine.price,
            "total_price": line_total,
        })
        total_price += line_total

    return {"cart": cart_items, "total_price": total_price}


@app.get("/medicines/{medicine_id}", response_model=MedicineResponse)
def get_medicine(medicine_id: int, db: Session = Depends(get_db)):
    medicine = db.get(models.Medicine, medicine_id)
    if medicine:
        return medicine
    raise HTTPException(status_code=404, detail="Medicine not found")


@app.get("/admin/orders", response_model=list[Order])
def get_orders(current_admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    return [order_to_schema(o) for o in db.query(models.Order).all()]


@app.get("/orders/{order_id}", response_model=Order)
def get_order(order_id: int, current_admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if order:
        return order_to_schema(order)
    raise HTTPException(status_code=404, detail="Order not found")


@app.get("/customer/orders", response_model=list[Order])
def get_customer_orders(
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    orders = db.query(models.Order).filter(models.Order.customer_id == current_customer.id).all()
    return [order_to_schema(o) for o in orders]


@app.post("/medicines", response_model=MedicineResponse)
def add_medicine(
    medicine: Medicine,
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    db_medicine = models.Medicine(**medicine.model_dump())
    db.add(db_medicine)
    db.commit()
    db.refresh(db_medicine)
    return db_medicine


@app.post("/cart")
def add_to_cart(
    item: CartItem,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    medicine = db.get(models.Medicine, item.medicine_id)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    cart_item = db.query(models.CartItem).filter(
        models.CartItem.customer_id == current_customer.id,
        models.CartItem.medicine_id == item.medicine_id,
    ).first()

    previous_quantity = cart_item.quantity if cart_item else 0
    new_quantity = previous_quantity + item.quantity

    if medicine.stock < new_quantity:
        raise HTTPException(status_code=400, detail="Not enough stock available")

    if cart_item:
        cart_item.quantity = new_quantity
    else:
        cart_item = models.CartItem(
            customer_id=current_customer.id, medicine_id=item.medicine_id, quantity=new_quantity
        )
        db.add(cart_item)

    db.commit()

    return {"message": f"Added {new_quantity} of {medicine.name} to cart."}


@app.post("/checkout")
def checkout(
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    cart_items = db.query(models.CartItem).filter(models.CartItem.customer_id == current_customer.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    now = datetime.now(timezone.utc)
    order_items_data = []
    total_price = 0.0

    for cart_item in cart_items:
        medicine = cart_item.medicine
        quantity = cart_item.quantity

        if medicine.stock < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for {medicine.name}. Available: {medicine.stock}, Requested: {quantity}",
            )

        if medicine.prescription_required:
            prescription = db.query(models.Prescription).filter(
                models.Prescription.customer_id == current_customer.id,
                models.Prescription.medicine_id == medicine.id,
                models.Prescription.status == PrescriptionStatus.APPROVED.value,
                models.Prescription.expiry_date > now,
            ).first()
            if not prescription:
                raise HTTPException(
                    status_code=400,
                    detail=f"Prescription required for {medicine.name} and not found, not approved, or expired",
                )

        line_total = medicine.price * quantity
        total_price += line_total
        order_items_data.append(models.OrderItem(
            medicine_id=medicine.id, name=medicine.name, quantity=quantity,
            price=medicine.price, total_price=line_total,
        ))

    order = models.Order(
        customer_id=current_customer.id,
        total_price=total_price,
        status=OrderStatus.PENDING.value,
        items=order_items_data,
    )
    db.add(order)

    for cart_item in cart_items:
        cart_item.medicine.stock -= cart_item.quantity
        db.delete(cart_item)

    db.commit()
    db.refresh(order)

    return {"message": "Order placed successfully", "order": order_to_schema(order)}


@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Single login endpoint for both admins and customers.

    Admin usernames and customer usernames live in separate tables, so we
    just try admin first, then customer. The issued token carries a "role"
    claim that get_current_admin/get_current_customer check afterwards.
    """
    admin = db.query(models.Admin).filter(models.Admin.username == form_data.username).first()
    if admin and password_hash.verify(form_data.password, admin.password):
        access_token = create_access_token(data={"sub": admin.username, "role": "admin"})
        return {"access_token": access_token, "token_type": "bearer", "role": "admin"}

    customer = db.query(models.Customer).filter(models.Customer.username == form_data.username).first()
    if customer and password_hash.verify(form_data.password, customer.password):
        access_token = create_access_token(data={"sub": customer.username, "role": "customer"})
        return {"access_token": access_token, "token_type": "bearer", "role": "customer"}

    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.post("/admin/admins")
def create_admin(
    admin: AdminCreate,
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Lets an existing admin provision another admin account in the database."""
    existing = db.query(models.Admin).filter(models.Admin.username == admin.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Admin username already exists")

    db_admin = models.Admin(username=admin.username, password=password_hash.hash(admin.password))
    db.add(db_admin)
    db.commit()

    return {"message": f"Admin '{db_admin.username}' created"}


@app.get("/admin/prescriptions", response_model=list[Prescription])
def get_all_prescriptions(
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    prescriptions = db.query(models.Prescription).all()
    return [
        Prescription(
            id=p.id,
            customer_username=p.customer.username,
            medicine_id=p.medicine_id,
            doctor_name=p.doctor_name,
            prescription_date=p.prescription_date,
            expiry_date=p.expiry_date,
            status=PrescriptionStatus(p.status),
        )
        for p in prescriptions
    ]


@app.post("/register", response_model=CustomerResponse)
def register_customer(customer: Customer, db: Session = Depends(get_db)):
    existing = db.query(models.Customer).filter(
        (models.Customer.username == customer.username) | (models.Customer.email == customer.email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    db_customer = models.Customer(
        username=customer.username,
        email=customer.email,
        password=password_hash.hash(customer.password),
    )
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)

    return db_customer


@app.post("/prescriptions", response_model=Prescription)
def submit_prescription(
    prescription: PrescriptionCreate,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    medicine = db.get(models.Medicine, prescription.medicine_id)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    if not medicine.prescription_required:
        raise HTTPException(status_code=400, detail="Prescription not required for this medicine")

    if prescription.prescription_date > datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Prescription date cannot be in the future")

    if prescription.expiry_date <= prescription.prescription_date:
        raise HTTPException(status_code=400, detail="Expiry date must be after prescription date")

    db_prescription = models.Prescription(
        customer_id=current_customer.id,
        medicine_id=prescription.medicine_id,
        doctor_name=prescription.doctor_name,
        prescription_date=prescription.prescription_date,
        expiry_date=prescription.expiry_date,
        status=PrescriptionStatus.PENDING.value,
    )
    db.add(db_prescription)
    db.commit()
    db.refresh(db_prescription)

    return Prescription(
        id=db_prescription.id,
        customer_username=current_customer.username,
        medicine_id=db_prescription.medicine_id,
        doctor_name=db_prescription.doctor_name,
        prescription_date=db_prescription.prescription_date,
        expiry_date=db_prescription.expiry_date,
        status=PrescriptionStatus(db_prescription.status),
    )


@app.post("/orders/{order_id}/payment")
async def process_payment(
    order_id: int,
    request: Request,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.customer_id != current_customer.id:
        raise HTTPException(status_code=403, detail="Not authorized to pay for this order")
    if order.payment_status != PaymentStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Payment has already been processed")

    reference = f"order_{order_id}_{uuid.uuid4().hex}"
    order.payment_reference = reference
    db.commit()

    # Paystack redirects the shopper here after they pay, appending its own
    # ?reference=...&trxref=... query params — we tack on order_id ourselves
    # so payment-callback.html knows which order to verify.
    callback_url = f"{str(request.base_url).rstrip('/')}/frontend/payment-callback.html?order_id={order_id}"

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.paystack.co/transaction/initialize",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"},
            json={
                "email": current_customer.email,
                "amount": int(order.total_price * 100),
                "reference": reference,
                "callback_url": callback_url,
            },
        )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Could not initialize payment")

    payment_data = response.json()
    return {
        "message": "Payment initialized",
        "authorization_url": payment_data["data"]["authorization_url"],
        "reference": payment_data["data"]["reference"],
    }


@app.post("/orders/{order_id}/payment/verify")
async def verify_payment(
    order_id: int,
    reference: str,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.customer_id != current_customer.id:
        raise HTTPException(status_code=403, detail="Not authorized to verify payment for this order")

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
        )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Could not verify payment")

    transaction = response.json()["data"]
    expected_amount = int(order.total_price * 100)

    if transaction["status"] != "success":
        order.payment_status = PaymentStatus.FAILED.value
        db.commit()
        return {"message": "Payment verification failed"}

    if transaction["amount"] < expected_amount:
        raise HTTPException(status_code=400, detail="Payment amount does not match order amount")

    if transaction["reference"] != order.payment_reference:
        raise HTTPException(status_code=400, detail="Payment reference does not match order")

    order.payment_status = PaymentStatus.PAID.value
    db.commit()

    return {"message": "Payment verified successfully", "order": order_to_schema(order)}


@app.put("/medicines/{medicine_id}", response_model=MedicineResponse)
def update_medicine(
    medicine_id: int,
    medicine: MedicineUpdate,
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    db_medicine = db.get(models.Medicine, medicine_id)
    if not db_medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    for field, value in medicine.model_dump(exclude_unset=True).items():
        setattr(db_medicine, field, value)

    db.commit()
    db.refresh(db_medicine)
    return db_medicine


@app.put("/cart/{medicine_id}")
def update_cart_item(
    medicine_id: int,
    item: CartUpdate,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    medicine = db.get(models.Medicine, medicine_id)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")

    cart_item = db.query(models.CartItem).filter(
        models.CartItem.customer_id == current_customer.id,
        models.CartItem.medicine_id == medicine_id,
    ).first()
    if not cart_item:
        raise HTTPException(status_code=404, detail="Item not found in cart")

    if medicine.stock < item.quantity:
        raise HTTPException(status_code=400, detail="Not enough stock available")

    cart_item.quantity = item.quantity
    db.commit()

    return {"message": f"Updated cart item for medicine ID {medicine_id} to quantity {item.quantity}"}


@app.put("/admin/orders/{order_id}/status", response_model=Order)
def update_order_status(
    order_id: int,
    status_update: OrderStatusUpdate,
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = order.status
    new_status = status_update.status.value

    valid_transitions = {
        OrderStatus.PENDING.value: {OrderStatus.PROCESSING.value, OrderStatus.CANCELLED.value},
        OrderStatus.PROCESSING.value: {OrderStatus.SHIPPED.value, OrderStatus.CANCELLED.value},
        OrderStatus.SHIPPED.value: {OrderStatus.DELIVERED.value},
    }

    if current_status in (OrderStatus.DELIVERED.value, OrderStatus.CANCELLED.value):
        raise HTTPException(status_code=400, detail=f"{current_status} orders cannot be changed")

    if new_status not in valid_transitions.get(current_status, set()):
        raise HTTPException(
            status_code=400,
            detail=f"{current_status} orders cannot transition to {new_status}",
        )

    order.status = new_status
    db.commit()
    db.refresh(order)

    return order_to_schema(order)

@app.put("/admin/prescriptions/{prescription_id}/status", response_model=Prescription)
def update_prescription_status(
    prescription_id: int,
    status_update: PrescriptionStatusUpdate,
    current_admin: models.Admin = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    prescription = db.get(models.Prescription, prescription_id)
    if not prescription:
        raise HTTPException(status_code=404, detail="Prescription not found")

    if prescription.status != PrescriptionStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Only pending prescriptions can be updated")

    if status_update.status == PrescriptionStatus.EXPIRED:
        raise HTTPException(status_code=400, detail="Expired status is handled automatically")

    prescription.status = status_update.status.value
    db.commit()
    db.refresh(prescription)

    return Prescription(
        id=prescription.id,
        customer_username=prescription.customer.username,
        medicine_id=prescription.medicine_id,
        doctor_name=prescription.doctor_name,
        prescription_date=prescription.prescription_date,
        expiry_date=prescription.expiry_date,
        status=PrescriptionStatus(prescription.status),
    )


@app.delete("/medicines/{medicine_id}", response_model=MedicineResponse)
def delete_medicine(medicine_id: int, current_admin: models.Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    medicine = db.get(models.Medicine, medicine_id)
    if not medicine:
        raise HTTPException(status_code=404, detail="Medicine not found")
    deleted_medicine = MedicineResponse.model_validate(medicine)
    db.delete(medicine)
    db.commit()
    return deleted_medicine
    
@app.delete("/cart/{medicine_id}")
def remove_from_cart(
    medicine_id: int,
    current_customer: models.Customer = Depends(get_current_customer),
    db: Session = Depends(get_db),
):
    cart_item = db.query(models.CartItem).filter(
        models.CartItem.customer_id == current_customer.id,
        models.CartItem.medicine_id == medicine_id,
    ).first()
    if not cart_item:
        raise HTTPException(status_code=404, detail="Item not found in cart")

    db.delete(cart_item)
    db.commit()
    return {"message": "Item removed from cart"}