#![forbid(unsafe_code)]
use core::cmp::Ordering;

use core::sync::atomic::{AtomicU64, Ordering as Memory};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Overflow;

pub type R<T> = Result<T, Overflow>;

static WORK: AtomicU64 = AtomicU64::new(0);

pub fn tick(units: u64) { WORK.fetch_add(units, Memory::Relaxed); }

pub fn work() -> u64 { WORK.load(Memory::Relaxed) }

pub trait Same {
    fn same(&self, other: &Self) -> bool;
}

pub trait Key {
    fn key(&self, other: &Self) -> Ordering;
}

impl Same for bool {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for bool {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u8 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u8 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u16 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u16 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u32 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u32 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for u64 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for u64 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i8 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i8 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i16 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i16 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i32 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i32 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for i64 {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl Key for i64 {
    fn key(&self, other: &Self) -> Ordering { self.cmp(other) }
}

impl Same for Ordering {
    fn same(&self, other: &Self) -> bool { self == other }
}

impl<A: Key, B: Key> Key for (A, B) {
    fn key(&self, other: &Self) -> Ordering { match self.0.key(&other.0) { Ordering::Equal => self.1.key(&other.1), decided => decided, } }
}

pub fn equal<T: Same>(a: T, b: T) -> bool { a.same(&b) }

pub fn compare<T: Key>(a: T, b: T) -> Ordering { a.key(&b) }

pub fn nat_add(p0: u64, p1: u64) -> R<u64> {
    match u64::checked_add(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn nat_sub(p0: u64, p1: u64) -> u64 {
    u64::saturating_sub(p0, p1)
}

pub fn nat_mul(p0: u64, p1: u64) -> R<u64> {
    match u64::checked_mul(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn nat_quot(p0: u64, p1: u64, p2: u64) -> u64 {
    u64::checked_div(p0, p1).unwrap_or(p2)
}

pub fn nat_rem(p0: u64, p1: u64, p2: u64) -> u64 {
    u64::checked_rem(p0, p1).unwrap_or(p2)
}

pub fn nat_eq(p0: u64, p1: u64) -> bool {
    core::cmp::PartialEq::eq(&p0, &p1)
}

pub fn nat_le(p0: u64, p1: u64) -> bool {
    core::cmp::PartialOrd::le(&p0, &p1)
}

pub fn nat_lt(p0: u64, p1: u64) -> bool {
    core::cmp::PartialOrd::lt(&p0, &p1)
}

pub fn nat_succ(p0: u64) -> R<u64> {
    match u64::checked_add(p0, 1u64) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<u64, Overflow>(Overflow)
        }
    }
}

pub fn int_add(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_add(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_sub(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_sub(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_mul(p0: i64, p1: i64) -> R<i64> {
    match i64::checked_mul(p0, p1) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_neg(p0: i64) -> R<i64> {
    match i64::checked_neg(p0) {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    }
}

pub fn int_quot(p0: i64, p1: i64, p2: i64) -> R<i64> {
    { let value = { let (a, b, z): (i64, i64, i64) = (p0, p1, p2); if b == 0 { Some(z) } else { a.checked_div(b) } }; match value {
        Some(v0) => {
            Ok(v0)
        }
        None => {
            Err::<i64, Overflow>(Overflow)
        }
    } }
}

pub fn int_rem(p0: i64, p1: i64, p2: i64) -> i64 {
    { let (a, b, z): (i64, i64, i64) = (p0, p1, p2); if b == 0 { z } else { a.wrapping_rem(b) } }
}

pub fn bool_not(p0: bool) -> bool {
    !p0
}

pub fn bool_and(p0: bool, p1: bool) -> bool {
    if p0 {
        p1
    } else {
        false
    }
}

pub fn bool_or(p0: bool, p1: bool) -> bool {
    if p0 {
        true
    } else {
        p1
    }
}

pub mod fixed_u8 {
    pub fn checked_add(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u8, p1: u8) -> Option<u8> {
        u8::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u8, p1: u8) -> u8 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u8, p1: u8) -> u8 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u8, p1: u8) -> u8 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u8) -> u8 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u8, p1: u32) -> Option<u8> {
        u8::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u8, p1: u32) -> Option<u8> {
        u8::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u8> {
        u8::try_from(p0).ok()
    }
}

pub mod fixed_u16 {
    pub fn checked_add(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u16, p1: u16) -> Option<u16> {
        u16::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u16, p1: u16) -> u16 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u16, p1: u16) -> u16 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u16, p1: u16) -> u16 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u16) -> u16 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u16, p1: u32) -> Option<u16> {
        u16::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u16, p1: u32) -> Option<u16> {
        u16::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u16> {
        u16::try_from(p0).ok()
    }
}

pub mod fixed_u32 {
    pub fn checked_add(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u32, p1: u32) -> u32 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u32, p1: u32) -> u32 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u32, p1: u32) -> u32 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u32) -> u32 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u32, p1: u32) -> Option<u32> {
        u32::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u32> {
        u32::try_from(p0).ok()
    }
}

pub mod fixed_u64 {
    pub fn checked_add(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: u64, p1: u64) -> Option<u64> {
        u64::checked_div(p0, p1)
    }

    pub fn bit_and(p0: u64, p1: u64) -> u64 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: u64, p1: u64) -> u64 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: u64, p1: u64) -> u64 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: u64) -> u64 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: u64, p1: u32) -> Option<u64> {
        u64::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: u64, p1: u32) -> Option<u64> {
        u64::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<u64> {
        u64::try_from(p0).ok()
    }
}

pub mod fixed_i8 {
    pub fn checked_add(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i8, p1: i8) -> Option<i8> {
        i8::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i8, p1: i8) -> i8 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i8, p1: i8) -> i8 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i8, p1: i8) -> i8 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i8) -> i8 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i8, p1: u32) -> Option<i8> {
        i8::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i8, p1: u32) -> Option<i8> {
        i8::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i8> {
        i8::try_from(p0).ok()
    }
}

pub fn checked_neg_i8(p0: i8) -> Option<i8> {
    i8::checked_neg(p0)
}

pub mod fixed_i16 {
    pub fn checked_add(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i16, p1: i16) -> Option<i16> {
        i16::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i16, p1: i16) -> i16 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i16, p1: i16) -> i16 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i16, p1: i16) -> i16 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i16) -> i16 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i16, p1: u32) -> Option<i16> {
        i16::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i16, p1: u32) -> Option<i16> {
        i16::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i16> {
        i16::try_from(p0).ok()
    }
}

pub fn checked_neg_i16(p0: i16) -> Option<i16> {
    i16::checked_neg(p0)
}

pub mod fixed_i32 {
    pub fn checked_add(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i32, p1: i32) -> Option<i32> {
        i32::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i32, p1: i32) -> i32 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i32, p1: i32) -> i32 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i32, p1: i32) -> i32 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i32) -> i32 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i32, p1: u32) -> Option<i32> {
        i32::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i32, p1: u32) -> Option<i32> {
        i32::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i32> {
        i32::try_from(p0).ok()
    }
}

pub fn checked_neg_i32(p0: i32) -> Option<i32> {
    i32::checked_neg(p0)
}

pub mod fixed_i64 {
    pub fn checked_add(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_add(p0, p1)
    }

    pub fn checked_sub(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_sub(p0, p1)
    }

    pub fn checked_mul(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_mul(p0, p1)
    }

    pub fn checked_quot(p0: i64, p1: i64) -> Option<i64> {
        i64::checked_div(p0, p1)
    }

    pub fn bit_and(p0: i64, p1: i64) -> i64 {
        core::ops::BitAnd::bitand(p0, p1)
    }

    pub fn bit_or(p0: i64, p1: i64) -> i64 {
        core::ops::BitOr::bitor(p0, p1)
    }

    pub fn bit_xor(p0: i64, p1: i64) -> i64 {
        core::ops::BitXor::bitxor(p0, p1)
    }

    pub fn bit_not(p0: i64) -> i64 {
        core::ops::Not::not(p0)
    }

    pub fn shift_left(p0: i64, p1: u32) -> Option<i64> {
        i64::checked_shl(p0, p1)
    }

    pub fn shift_right(p0: i64, p1: u32) -> Option<i64> {
        i64::checked_shr(p0, p1)
    }

    pub fn convert(p0: i128) -> Option<i64> {
        i64::try_from(p0).ok()
    }
}

pub fn checked_neg_i64(p0: i64) -> Option<i64> {
    i64::checked_neg(p0)
}
use core::str;

use std::mem;

use std::rc::Rc;

#[derive(Clone)]
pub struct Str(Rc<str>);

impl Str {
    pub fn lit(text: &str) -> Str { Str(Rc::from(text)) }
    pub fn text(&self) -> &str { &self.0 }
    pub fn length(&self) -> u64 { chars(&self.0) }
    pub fn utf8_encode(&self) -> Bytes { tick(self.0.len() as u64); Bytes::lit(self.0.as_bytes()) }
    pub fn split_exact(&self, delimiter: &Str, maximum: u32) -> Option<List<Str>> { if delimiter.0.is_empty() { return None; }; chars(&self.0); let mut fields: Vec<Str> = Vec::new(); for piece in self.0.split(&*delimiter.0) { fields.push(Str::lit(piece)); }; if fields.len() as u128 > u128::from(maximum) { return None; }; Some(List::onto(fields, List::nil())) }
    pub fn join(texts: List<Str>, delimiter: &Str) -> Str { let mut out = String::new(); let mut first = true; let mut cursor = &texts; while let Repr::Cell(cell) = &cursor.0 { tick(1); if !first { chars(&delimiter.0); out.push_str(&delimiter.0); }; first = false; chars(&cell.head.0); out.push_str(&cell.head.0); cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for text in buffer[..*len].iter().rev() { tick(1); if !first { chars(&delimiter.0); out.push_str(&delimiter.0); }; first = false; chars(&text.0); out.push_str(&text.0); } }, _ => { }, }; Str::lit(&out) }
}

#[derive(Clone)]
pub struct Bytes(Rc<[u8]>);

impl Bytes {
    pub fn lit(octets: &[u8]) -> Bytes { Bytes(Rc::from(octets)) }
    pub fn octets(&self) -> &[u8] { &self.0 }
    pub fn append(a: Bytes, b: Bytes) -> Bytes { tick((a.0.len() + b.0.len()) as u64); let mut out = Vec::with_capacity(a.0.len() + b.0.len()); out.extend_from_slice(&a.0); out.extend_from_slice(&b.0); Bytes(Rc::from(out)) }
    pub fn length(&self) -> u64 { self.0.len() as u64 }
    pub fn index(&self, i: u64) -> Option<u8> { match usize::try_from(i) { Ok(at) => self.0.get(at).copied(), Err(_) => None, } }
    pub fn slice(&self, start: u64, count: u64) -> Option<Bytes> { let end = u128::from(start) + u128::from(count); if end > self.0.len() as u128 { return None; }; tick(count); Some(Bytes::lit(&self.0[start as usize..end as usize])) }
    pub fn utf8_decode(&self) -> Option<Str> { tick(self.0.len() as u64); match str::from_utf8(&self.0) { Ok(text) => Some(Str::lit(text)), Err(_) => None, } }
    pub fn compare(&self, other: &Bytes) -> Ordering { tick(1 + self.0.len().min(other.0.len()) as u64); self.0.cmp(&other.0) }
}

pub struct Node<T> { head: T, tail: List<T> }

pub enum Repr<T> { Nil, Run { buffer: Rc<Vec<T>>, len: usize }, Cell(Rc<Node<T>>) }

pub struct List<T>(Repr<T>);

impl<T> Clone for List<T> {
    fn clone(&self) -> Self { List(match &self.0 { Repr::Nil => Repr::Nil, Repr::Run { buffer, len } => Repr::Run { buffer: buffer.clone(), len: *len }, Repr::Cell(cell) => Repr::Cell(cell.clone()), }) }
}

impl<T> List<T> {
    fn take(&mut self) -> Repr<T> { mem::replace(&mut self.0, Repr::Nil) }
}

impl<T> Drop for Node<T> {
    fn drop(&mut self) { let mut next = match self.tail.take() { Repr::Cell(cell) => Some(cell), _ => None, }; while let Some(cell) = next { match Rc::try_unwrap(cell) { Ok(mut node) => next = match node.tail.take() { Repr::Cell(cell) => Some(cell), _ => None, }, Err(_) => break, } } }
}

impl<T: Clone> List<T> {
    pub fn nil() -> Self { List(Repr::Nil) }
    pub fn cons(head: T, mut tail: List<T>) -> Self { List(match tail.take() { Repr::Nil => { let mut buffer = Vec::with_capacity(16); buffer.push(head); Repr::Run { buffer: Rc::new(buffer), len: 1 } }, Repr::Run { mut buffer, len } => { match Rc::get_mut(&mut buffer) { Some(cells) => { cells.truncate(len); cells.push(head); Repr::Run { buffer, len: len + 1 } }, None => Repr::Cell(Rc::new(Node { head, tail: List(Repr::Run { buffer, len }) })), } }, rest => Repr::Cell(Rc::new(Node { head, tail: List(rest) })), }) }
    pub fn uncons(&self) -> Option<(T, List<T>)> { match &self.0 { Repr::Nil => None, Repr::Run { buffer, len } => { let head = buffer[len - 1].clone(); Some((head, List(if *len == 1 { Repr::Nil } else { Repr::Run { buffer: buffer.clone(), len: len - 1 } }))) }, Repr::Cell(cell) => Some((cell.head.clone(), cell.tail.clone())), } }
    pub fn length(&self) -> u64 { let mut count = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); count += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for _ in buffer[..*len].iter().rev() { tick(1); count += 1; } }, _ => { }, }; count }
    pub fn append(a: List<T>, b: List<T>) -> List<T> { List::onto(a.items(), b) }
    pub fn index(&self, i: u64) -> Option<T> { let mut position = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); if position == i { return Some(cell.head.clone()); }; position += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); if position == i { return Some(item.clone()); }; position += 1; } }, _ => { }, }; None }
    pub fn slice(&self, start: u64, count: u64) -> Option<List<T>> { let end = u128::from(start) + u128::from(count); let mut part = Vec::new(); let mut position: u128 = 0; let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); if position >= end { return Some(List::onto(part, List::nil())); }; if position >= u128::from(start) { part.push(cell.head.clone()); }; position += 1; cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); if position >= end { return Some(List::onto(part, List::nil())); }; if position >= u128::from(start) { part.push(item.clone()); }; position += 1; } }, _ => { }, }; if position < end { None } else { Some(List::onto(part, List::nil())) } }
    fn items(&self) -> Vec<T> { let mut out = Vec::new(); let mut cursor = self; while let Repr::Cell(cell) = &cursor.0 { tick(1); out.push(cell.head.clone()); cursor = &cell.tail; }; match &cursor.0 { Repr::Run { buffer, len } => { for item in buffer[..*len].iter().rev() { tick(1); out.push(item.clone()); } }, _ => { }, }; out }
    fn onto(mut items: Vec<T>, tail: List<T>) -> List<T> { let mut out = tail; while let Some(item) = items.pop() { tick(1); out = List::cons(item, out); }; out }
}

pub fn chars(text: &str) -> u64 { let mut count = 0; for _ in text.chars() { tick(1); count += 1; }; count }

impl Same for Str {
    fn same(&self, other: &Self) -> bool { let mut left = self.0.chars(); let mut right = other.0.chars(); loop { tick(1); match (left.next(), right.next()) { (None, None) => return true, (a, b) if a != b => return false, _ => { }, } } }
}

impl Same for Bytes {
    fn same(&self, other: &Self) -> bool { tick(1 + self.0.len().min(other.0.len()) as u64); self.0 == other.0 }
}

impl Key for Str {
    fn key(&self, other: &Self) -> Ordering { let mut left = self.0.chars(); let mut right = other.0.chars(); loop { tick(1); match (left.next(), right.next()) { (None, None) => return Ordering::Equal, (None, Some(_)) => return Ordering::Less, (Some(_), None) => return Ordering::Greater, (Some(a), Some(b)) => match a.cmp(&b) { Ordering::Equal => { }, decided => return decided, }, } } }
}

pub fn canonical_decimal(text: &str) -> Option<Option<i128>> { let digits = match text.strip_prefix('-') { Some(rest) => rest, None => text, }; let mut canonical = !digits.is_empty() && (digits == "0" || !digits.starts_with('0')) && text != "-0"; for c in digits.chars() { tick(1); canonical = canonical && c.is_ascii_digit(); }; if !canonical { return None; }; Some(text.parse::<i128>().ok()) }

pub fn parse_int(text: Str) -> R<Option<i64>> { match canonical_decimal(&text.0) { None => Ok(None), Some(Some(n)) => match i64::try_from(n) { Ok(value) => Ok(Some(value)), Err(_) => Err(Overflow), }, Some(None) => Err(Overflow), } }

pub fn format_u8(a: u8) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u8(text: Str) -> Option<u8> { match canonical_decimal(&text.0) { Some(Some(n)) => u8::try_from(n).ok(), _ => None, } }

pub fn format_u16(a: u16) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u16(text: Str) -> Option<u16> { match canonical_decimal(&text.0) { Some(Some(n)) => u16::try_from(n).ok(), _ => None, } }

pub fn format_u32(a: u32) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u32(text: Str) -> Option<u32> { match canonical_decimal(&text.0) { Some(Some(n)) => u32::try_from(n).ok(), _ => None, } }

pub fn format_u64(a: u64) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_u64(text: Str) -> Option<u64> { match canonical_decimal(&text.0) { Some(Some(n)) => u64::try_from(n).ok(), _ => None, } }

pub fn format_i8(a: i8) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i8(text: Str) -> Option<i8> { match canonical_decimal(&text.0) { Some(Some(n)) => i8::try_from(n).ok(), _ => None, } }

pub fn format_i16(a: i16) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i16(text: Str) -> Option<i16> { match canonical_decimal(&text.0) { Some(Some(n)) => i16::try_from(n).ok(), _ => None, } }

pub fn format_i32(a: i32) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i32(text: Str) -> Option<i32> { match canonical_decimal(&text.0) { Some(Some(n)) => i32::try_from(n).ok(), _ => None, } }

pub fn format_i64(a: i64) -> Str { let text = a.to_string(); tick(text.len() as u64); Str::lit(&text) }

pub fn parse_i64(text: Str) -> Option<i64> { match canonical_decimal(&text.0) { Some(Some(n)) => i64::try_from(n).ok(), _ => None, } }

pub fn append_list<T: Clone>(p0: List<T>, p1: List<T>) -> List<T> {
    List::append(p0, p1)
}

pub fn length_list<T: Clone>(p0: List<T>) -> u64 {
    List::length(&p0)
}

pub fn index_list<T: Clone>(p0: List<T>, p1: u64) -> Option<T> {
    List::index(&p0, p1)
}

pub fn slice_list<T: Clone>(p0: List<T>, p1: u64, p2: u64) -> Option<List<T>> {
    List::slice(&p0, p1, p2)
}

pub fn append_bytes(p0: Bytes, p1: Bytes) -> Bytes {
    Bytes::append(p0, p1)
}

pub fn length_bytes(p0: Bytes) -> u64 {
    Bytes::length(&p0)
}

pub fn length_string(p0: Str) -> u64 {
    Str::length(&p0)
}

pub fn index_bytes(p0: Bytes, p1: u64) -> Option<u8> {
    Bytes::index(&p0, p1)
}

pub fn slice_bytes(p0: Bytes, p1: u64, p2: u64) -> Option<Bytes> {
    Bytes::slice(&p0, p1, p2)
}

pub fn utf8_encode(p0: Str) -> Bytes {
    Str::utf8_encode(&p0)
}

pub fn utf8_decode(p0: Bytes) -> Option<Str> {
    Bytes::utf8_decode(&p0)
}

pub fn compare_bytes(p0: Bytes, p1: Bytes) -> Ordering {
    Bytes::compare(&p0, &p1)
}

pub fn split_exact(p0: Str, p1: Str, p2: u32) -> Option<List<Str>> {
    Str::split_exact(&p0, &p1, p2)
}

pub fn join(p0: List<Str>, p1: Str) -> Str {
    Str::join(p0, &p1)
}

#[derive(Clone)]
pub enum Adt0 {
    C0(List<(Bytes, Bytes)>, List<Adt1>, Str, List<Str>, Adt4),
}

#[derive(Clone)]
pub enum Adt1 {
    C0(Str, Str, bool, Adt2, Str, Adt3),
}

#[derive(Clone)]
pub enum Adt2 {
    C0,
    C1,
    C2,
}

#[derive(Clone)]
pub enum Adt3 {
    C0,
    C1,
    C2,
}

#[derive(Clone)]
pub enum Adt4 {
    C0,
    C1,
    C2,
    C3,
}

#[derive(Clone)]
pub enum Adt5 {
    C0(Adt6, Str, Adt8),
}

#[derive(Clone)]
pub enum Adt6 {
    C0(Str, Adt7, Str, Str, List<Str>, List<Str>),
}

#[derive(Clone)]
pub enum Adt7 {
    C0,
    C1,
}

#[derive(Clone)]
pub enum Adt8 {
    C0,
    C1,
    C2,
    C3,
}

#[derive(Clone)]
pub enum Adt9 {
    C0(Str, List<Str>),
}

#[derive(Clone)]
pub enum Adt10 {
    C0(Str, Str, Str, Str, Str, Adt11),
}

#[derive(Clone)]
pub enum Adt11 {
    C0,
    C1,
    C2,
}

#[derive(Clone)]
pub enum Adt12 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32),
}

#[derive(Clone)]
pub enum Adt13 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32, u32),
}

#[derive(Clone)]
pub enum Adt14 {
    C0(u32, u32, u32, u32, u32, u32, u32, u32, Adt13, u64),
}

#[derive(Clone)]
pub enum Fn0 {
    F8(Adt0, List<Str>),
    F143,
}

impl Fn0 {
    pub fn apply(&self, p0: List<Bytes>, p1: Adt5) -> R<List<Bytes>> {
        match self {
            Fn0::F8(k0, k1) => f8(k0.clone(), k1.clone(), p0, p1),
            Fn0::F143 => Ok(f143(p0, p1)),
        }
    }
}

#[derive(Clone)]
pub enum Fn1 {
    F13,
}

impl Fn1 {
    pub fn apply(&self, p0: Adt0, p1: Bytes) -> R<Adt0> {
        match self {
            Fn1::F13 => f13(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn2 {
    F17,
}

impl Fn2 {
    pub fn apply(&self, p0: List<Str>, p1: Str) -> List<Str> {
        match self {
            Fn2::F17 => f17(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn3 {
    F20(List<(Str, bool)>, List<(Bytes, Bytes)>),
}

impl Fn3 {
    pub fn apply(&self, p0: (List<Adt5>, List<(List<Str>, Str)>), p1: Adt6) -> R<(List<Adt5>, List<(List<Str>, Str)>)> {
        match self {
            Fn3::F20(k0, k1) => f20(k0.clone(), k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn4 {
    F22,
    F100,
}

impl Fn4 {
    pub fn apply(&self, p0: List<Adt6>, p1: Adt6) -> List<Adt6> {
        match self {
            Fn4::F22 => f22(p0, p1),
            Fn4::F100 => f100(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn5 {
    F25(Adt9),
}

impl Fn5 {
    pub fn apply(&self, p0: List<(Str, bool)>, p1: Adt1) -> List<(Str, bool)> {
        match self {
            Fn5::F25(k0) => f25(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn6 {
    F31,
    F142(Str),
}

impl Fn6 {
    pub fn apply(&self, p0: List<Bytes>, p1: Str) -> List<Bytes> {
        match self {
            Fn6::F31 => f31(p0, p1),
            Fn6::F142(k0) => f142(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn7 {
    F33(List<Str>),
}

impl Fn7 {
    pub fn apply(&self, p0: Str, p1: Adt5) -> Str {
        match self {
            Fn7::F33(k0) => f33(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn8 {
    F36(Bytes),
}

impl Fn8 {
    pub fn apply(&self, p0: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
        match self {
            Fn8::F36(k0) => f36(k0.clone(), p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn9 {
    F39,
}

impl Fn9 {
    pub fn apply(&self, p0: List<(Bytes, Bytes)>, p1: (Bytes, Bytes)) -> List<(Bytes, Bytes)> {
        match self {
            Fn9::F39 => f39(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn10 {
    F49,
}

impl Fn10 {
    pub fn apply(&self, p0: List<Bytes>) -> Option<List<Bytes>> {
        match self {
            Fn10::F49 => f49(p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn11 {
    F51,
}

impl Fn11 {
    pub fn apply(&self, p0: List<Bytes>, p1: Bytes) -> List<Bytes> {
        match self {
            Fn11::F51 => f51(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn12 {
    F71,
    F74,
}

impl Fn12 {
    pub fn apply(&self, p0: List<Str>, p1: Adt6) -> List<Str> {
        match self {
            Fn12::F71 => f71(p0, p1),
            Fn12::F74 => f74(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn13 {
    F85(Str),
}

impl Fn13 {
    pub fn apply(&self, p0: Adt10, p1: (Str, Adt10)) -> Adt10 {
        match self {
            Fn13::F85(k0) => f85(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn14 {
    F90(Str),
    F109(List<Adt5>),
}

impl Fn14 {
    pub fn apply(&self, p0: bool, p1: Str) -> bool {
        match self {
            Fn14::F90(k0) => f90(k0.clone(), p0, p1),
            Fn14::F109(k0) => f109(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn15 {
    F92(List<Str>, Str),
    F125(List<Str>),
}

impl Fn15 {
    pub fn apply(&self, p0: List<Bytes>, p1: (Bytes, Bytes)) -> R<List<Bytes>> {
        match self {
            Fn15::F92(k0, k1) => f92(k0.clone(), k1.clone(), p0, p1),
            Fn15::F125(k0) => f125(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn16 {
    F95(Bytes),
}

impl Fn16 {
    pub fn apply(&self, p0: Option<Bytes>, p1: Bytes) -> Option<Bytes> {
        match self {
            Fn16::F95(k0) => f95(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn17 {
    F103(List<Str>),
}

impl Fn17 {
    pub fn apply(&self, p0: Option<Str>, p1: (List<Str>, Str)) -> Option<Str> {
        match self {
            Fn17::F103(k0) => f103(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn18 {
    F107(List<Adt5>),
}

impl Fn18 {
    pub fn apply(&self, p0: List<Adt5>, p1: Str) -> List<Adt5> {
        match self {
            Fn18::F107(k0) => f107(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn19 {
    F111,
}

impl Fn19 {
    pub fn apply(&self, p0: List<Adt8>, p1: Adt5) -> List<Adt8> {
        match self {
            Fn19::F111 => f111(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn20 {
    F115,
}

impl Fn20 {
    pub fn apply(&self, p0: (Option<Bytes>, List<Bytes>), p1: Bytes) -> (Option<Bytes>, List<Bytes>) {
        match self {
            Fn20::F115 => f115(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn21 {
    F118(Bytes, u64, Bytes, u64),
}

impl Fn21 {
    pub fn apply(&self, p0: u64) -> R<Option<u64>> {
        match self {
            Fn21::F118(k0, k1, k2, k3) => f118(k0.clone(), *k1, k2.clone(), *k3, p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn22 {
    F131,
}

impl Fn22 {
    pub fn apply(&self, p0: bool, p1: Adt8) -> bool {
        match self {
            Fn22::F131 => f131(p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn23 {
    F133(Str),
}

impl Fn23 {
    pub fn apply(&self, p0: Option<bool>, p1: (Str, bool)) -> Option<bool> {
        match self {
            Fn23::F133(k0) => f133(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn24 {
    F138(Bytes, u64, u64),
}

impl Fn24 {
    pub fn apply(&self, p0: (u64, Adt12)) -> R<(u64, Adt12)> {
        match self {
            Fn24::F138(k0, k1, k2) => f138(k0.clone(), *k1, *k2, p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn25 {
    F141(Str),
}

impl Fn25 {
    pub fn apply(&self, p0: Option<Adt5>, p1: Adt5) -> Option<Adt5> {
        match self {
            Fn25::F141(k0) => f141(k0.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn26 {
    F145(bool, Bytes),
}

impl Fn26 {
    pub fn apply(&self, p0: u64, p1: Str) -> R<u64> {
        match self {
            Fn26::F145(k0, k1) => f145(*k0, k1.clone(), p0, p1),
        }
    }
}

#[derive(Clone)]
pub enum Fn27 {
    F153,
}

impl Fn27 {
    pub fn apply(&self, p0: Adt14) -> R<Adt14> {
        match self {
            Fn27::F153 => f153(p0),
        }
    }
}

#[derive(Clone)]
pub enum Fn28 {
    F171,
}

impl Fn28 {
    pub fn apply(&self, p0: (u64, (u32, u32))) -> (u64, (u32, u32)) {
        match self {
            Fn28::F171 => f171(p0),
        }
    }
}

pub fn f0(v0: Bytes) -> R<Bytes> {
    let v1: Adt0 = f1(v0)?;
    let v2: List<Str> = f2(match v1.clone() {
        Adt0::C0(_, _, _, _, h1) => {
            h1
        }
    });
    let v3: List<Adt5> = f3(f4(), match v1.clone() {
        Adt0::C0(h2, _, _, _, _) => {
            h2
        }
    }, f5(v1.clone()))?;
    let a5 = f6(f7(Fn0::F8(v1, v2.clone()), List::<Bytes>::nil(), v3.clone())?);
    let a6 = {
        let a3 = f9(List::cons(Str::lit("sdk"), List::cons(f10(), List::<Str>::nil())));
        let a4 = f9(List::cons(Str::lit("check"), List::cons(f11(v3, v2), List::<Str>::nil())));
        append_bytes(a3, a4)
    };
    Ok(append_bytes(a5, a6))
}

pub fn f1(v0: Bytes) -> R<Adt0> {
    let v1: Adt0 = f12(Fn1::F13, Adt0::C0(List::<(Bytes, Bytes)>::nil(), List::<Adt1>::nil(), Str::lit(""), List::<Str>::nil(), Adt4::C3), f14(v0)?)?;
    Ok(Adt0::C0(f15(match v1.clone() {
        Adt0::C0(h7, _, _, _, _) => {
            h7
        }
    }), match v1.clone() {
        Adt0::C0(_, h8, _, _, _) => {
            h8
        }
    }, match v1.clone() {
        Adt0::C0(_, _, h9, _, _) => {
            h9
        }
    }, match v1.clone() {
        Adt0::C0(_, _, _, h10, _) => {
            h10
        }
    }, match v1 {
        Adt0::C0(_, _, _, _, h11) => {
            h11
        }
    }))
}

pub fn f2(v0: Adt4) -> List<Str> {
    f16(Fn2::F17, List::<Str>::nil(), f18(v0))
}

pub fn f3(v0: List<Adt6>, v1: List<(Bytes, Bytes)>, v2: List<(Str, bool)>) -> R<List<Adt5>> {
    let (h12, _) = f19(Fn3::F20(v2, v1), (List::<Adt5>::nil(), List::<(List<Str>, Str)>::nil()), v0)?;
    Ok(h12)
}

pub fn f4() -> List<Adt6> {
    f21(Fn4::F22, List::<Adt6>::nil(), f23())
}

pub fn f5(v0: Adt0) -> List<(Str, bool)> {
    let v1: Adt9 = Adt9::C0(match v0.clone() {
        Adt0::C0(_, _, h13, _, _) => {
            h13
        }
    }, match v0.clone() {
        Adt0::C0(_, _, _, h14, _) => {
            h14
        }
    });
    f24(Fn5::F25(v1), List::<(Str, bool)>::nil(), match v0 {
        Adt0::C0(_, h15, _, _, _) => {
            h15
        }
    })
}

pub fn f6(v0: List<Bytes>) -> Bytes {
    f26(f27(v0))
}

pub fn f7(v0: Fn0, p19: List<Bytes>, p20: List<Adt5>) -> R<List<Bytes>> {
    let m18 = (p19, p20);
    {
        let mut m18 = m18;
        loop {
            let step = {
                let (v1, v2) = m18;
                let m16 = v2;
                match m16.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Adt5>), R<List<Bytes>>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Adt5>), R<List<Bytes>>>(({
                            let c17: Fn0 = v0.clone();
                            c17.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m18 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f8(v0: Adt0, v1: List<Str>, v2: List<Bytes>, v3: Adt5) -> R<List<Bytes>> {
    Ok(List::cons(f28(v3, v1, match v0 {
        Adt0::C0(h21, _, _, _, _) => {
            h21
        }
    })?, v2))
}

pub fn f9(v0: List<Str>) -> Bytes {
    f29(f30(Fn6::F31, List::<Bytes>::nil(), v0))
}

pub fn f10() -> Str {
    Str::lit("ghcr.io/uor-foundation/prismpm-sdk@sha256:d6c263a733a6bc36e0458c3f5b9a1f5ea9c14dfbe8c257d3f650a960b5fe633c")
}

pub fn f11(v0: List<Adt5>, v1: List<Str>) -> Str {
    f32(Fn7::F33(v1), Str::lit("success"), v0)
}

pub fn f12(v0: Fn1, p25: Adt0, p26: List<Bytes>) -> R<Adt0> {
    let m24 = (p25, p26);
    {
        let mut m24 = m24;
        loop {
            let step = {
                let (v1, v2) = m24;
                let m22 = v2;
                match m22.uncons() {
                    None => {
                        Err::<(Adt0, List<Bytes>), R<Adt0>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(Adt0, List<Bytes>), R<Adt0>>(({
                            let c23: Fn1 = v0.clone();
                            c23.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m24 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f13(v0: Adt0, v1: Bytes) -> R<Adt0> {
    f34(v0, v1)
}

pub fn f14(v0: Bytes) -> R<List<Bytes>> {
    let v1: u64 = {
        let a27 = v0.clone();
        length_bytes(a27)
    };
    let v2: (u64, (u64, List<Bytes>)) = {
        let (h28, _) = f35(Fn8::F36(v0.clone()), v1, (0u64, (0u64, List::<Bytes>::nil())))?;
        h28
    };
    let v3: u64 = {
        let (h29, _) = {
            let (_, h30) = v2.clone();
            h30
        };
        h29
    };
    let v4: List<Bytes> = {
        let (_, h31) = {
            let (_, h32) = v2;
            h32
        };
        h31
    };
    let a33 = v3;
    let a34 = v1;
    if nat_lt(a33, a34) {
        Ok(f27(List::cons(f37(v0, v3, {
            let a35 = v1;
            let a36 = v3;
            nat_sub(a35, a36)
        }), v4)))
    } else {
        Ok(f27(v4))
    }
}

pub fn f15(v0: List<(Bytes, Bytes)>) -> List<(Bytes, Bytes)> {
    f38(Fn9::F39, List::<(Bytes, Bytes)>::nil(), v0)
}

pub fn f16(v0: Fn2, p40: List<Str>, p41: List<Str>) -> List<Str> {
    let m39 = (p40, p41);
    {
        let mut m39 = m39;
        loop {
            let step = {
                let (v1, v2) = m39;
                let m37 = v2;
                match m37.uncons() {
                    None => {
                        Err::<(List<Str>, List<Str>), List<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Str>, List<Str>), List<Str>>(({
                            let c38: Fn2 = v0.clone();
                            c38.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m39 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f17(v0: List<Str>, v1: Str) -> List<Str> {
    if f40(v1.clone()) {
        let a42 = v0;
        let a43 = List::cons(v1, List::<Str>::nil());
        append_list(a42, a43)
    } else {
        v0
    }
}

pub fn f18(v0: Adt4) -> List<Str> {
    let m44 = v0;
    match m44 {
        Adt4::C0 => {
            let a45 = f41(f42());
            let a46 = f43(f44());
            append_list(a45, a46)
        }
        Adt4::C1 => {
            f43(f23())
        }
        Adt4::C2 => {
            f43(f23())
        }
        Adt4::C3 => {
            f43(f23())
        }
    }
}

pub fn f19(v0: Fn3, p50: (List<Adt5>, List<(List<Str>, Str)>), p51: List<Adt6>) -> R<(List<Adt5>, List<(List<Str>, Str)>)> {
    let m49 = (p50, p51);
    {
        let mut m49 = m49;
        loop {
            let step = {
                let (v1, v2) = m49;
                let m47 = v2;
                match m47.uncons() {
                    None => {
                        Err::<((List<Adt5>, List<(List<Str>, Str)>), List<Adt6>), R<(List<Adt5>, List<(List<Str>, Str)>)>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<((List<Adt5>, List<(List<Str>, Str)>), List<Adt6>), R<(List<Adt5>, List<(List<Str>, Str)>)>>(({
                            let c48: Fn3 = v0.clone();
                            c48.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m49 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f20(v0: List<(Str, bool)>, v1: List<(Bytes, Bytes)>, v2: (List<Adt5>, List<(List<Str>, Str)>), v3: Adt6) -> R<(List<Adt5>, List<(List<Str>, Str)>)> {
    f45(v1, v0, v2, v3)
}

pub fn f21(v0: Fn4, p55: List<Adt6>, p56: List<Adt6>) -> List<Adt6> {
    let m54 = (p55, p56);
    {
        let mut m54 = m54;
        loop {
            let step = {
                let (v1, v2) = m54;
                let m52 = v2;
                match m52.uncons() {
                    None => {
                        Err::<(List<Adt6>, List<Adt6>), List<Adt6>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt6>, List<Adt6>), List<Adt6>>(({
                            let c53: Fn4 = v0.clone();
                            c53.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m54 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f22(v0: List<Adt6>, v1: Adt6) -> List<Adt6> {
    let a57 = v0;
    let a58 = List::cons(f46(v1), List::<Adt6>::nil());
    append_list(a57, a58)
}

pub fn f23() -> List<Adt6> {
    let a59 = f42();
    let a60 = f44();
    append_list(a59, a60)
}

pub fn f24(v0: Fn5, p64: List<(Str, bool)>, p65: List<Adt1>) -> List<(Str, bool)> {
    let m63 = (p64, p65);
    {
        let mut m63 = m63;
        loop {
            let step = {
                let (v1, v2) = m63;
                let m61 = v2;
                match m61.uncons() {
                    None => {
                        Err::<(List<(Str, bool)>, List<Adt1>), List<(Str, bool)>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<(Str, bool)>, List<Adt1>), List<(Str, bool)>>(({
                            let c62: Fn5 = v0.clone();
                            c62.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m63 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f25(v0: Adt9, v1: List<(Str, bool)>, v2: Adt1) -> List<(Str, bool)> {
    if f47(v2.clone(), v0) {
        List::cons((match v2.clone() {
            Adt1::C0(_, h66, _, _, _, _) => {
                h66
            }
        }, match v2 {
            Adt1::C0(_, _, h67, _, _, _) => {
                h67
            }
        }), v1)
    } else {
        v1
    }
}

pub fn f26(v0: List<Bytes>) -> Bytes {
    let m70 = {
        let (h68, _) = f48(Fn10::F49, {
            let a69 = v0.clone();
            length_list(a69)
        }, v0);
        h68
    };
    match m70.uncons() {
        None => {
            Bytes::lit(&[])
        }
        Some((v1, _)) => {
            v1
        }
    }
}

pub fn f27(v0: List<Bytes>) -> List<Bytes> {
    f50(Fn11::F51, List::<Bytes>::nil(), v0)
}

pub fn f28(v0: Adt5, v1: List<Str>, v2: List<(Bytes, Bytes)>) -> R<Bytes> {
    let v3: Adt6 = match v0.clone() {
        Adt5::C0(h71, _, _) => {
            h71
        }
    };
    let v4: Str = match v3.clone() {
        Adt6::C0(h72, _, _, _, _, _) => {
            h72
        }
    };
    let v5: Adt10 = f52(v4.clone());
    let v6: Bytes = {
        let a80 = {
            let a76 = f9(List::cons(Str::lit("obligation"), List::cons(v4.clone(), List::cons(f53(match v0.clone() {
                Adt5::C0(_, _, h73) => {
                    h73
                }
            }), List::cons(match v0.clone() {
                Adt5::C0(_, h74, _) => {
                    h74
                }
            }, List::<Str>::nil())))));
            let a77 = f9(List::cons(Str::lit("run"), List::cons(v4.clone(), List::cons(match v3.clone() {
                Adt6::C0(_, _, _, h75, _, _) => {
                    h75
                }
            }, List::<Str>::nil()))));
            append_bytes(a76, a77)
        };
        let a81 = f9(List::cons(Str::lit("access"), List::cons(v4.clone(), List::cons(f54(match v5.clone() {
            Adt10::C0(_, _, _, _, _, h78) => {
                h78
            }
        }), List::cons(match v5 {
            Adt10::C0(h79, _, _, _, _, _) => {
                h79
            }
        }, List::<Str>::nil())))));
        append_bytes(a80, a81)
    };
    let v7: Bytes = f29(List::cons(f55(Str::lit("sandbox")), List::cons(f55(v4.clone()), List::cons(f56(v4.clone()), List::<Bytes>::nil()))));
    let v8: bool = if f57(match v0.clone() {
        Adt5::C0(_, _, h82) => {
            h82
        }
    }) {
        f58(v4.clone(), v1.clone())
    } else {
        false
    };
    let v9: Bytes = if v8 {
        let a84 = f9(List::cons(Str::lit("establish"), List::cons(v4.clone(), List::<Str>::nil())));
        let a85 = f59(v4.clone(), match v3 {
            Adt6::C0(_, _, _, _, h83, _) => {
                h83
            }
        }, v2)?;
        append_bytes(a84, a85)
    } else {
        Bytes::lit(&[])
    };
    let v10: Bytes = if f58(v4.clone(), v1) {
        f9(List::cons(Str::lit("status"), List::cons(v4, List::cons(f60(match v0 {
            Adt5::C0(_, _, h86) => {
                h86
            }
        }), List::<Str>::nil()))))
    } else {
        Bytes::lit(&[])
    };
    let a91 = {
        let a89 = {
            let a87 = v6;
            let a88 = v7;
            append_bytes(a87, a88)
        };
        let a90 = v9;
        append_bytes(a89, a90)
    };
    let a92 = v10;
    Ok(append_bytes(a91, a92))
}

pub fn f29(v0: List<Bytes>) -> Bytes {
    let a93 = f61(v0, Bytes::lit(&[0x20]));
    let a94 = Bytes::lit(&[0x0a]);
    append_bytes(a93, a94)
}

pub fn f30(v0: Fn6, p98: List<Bytes>, p99: List<Str>) -> List<Bytes> {
    let m97 = (p98, p99);
    {
        let mut m97 = m97;
        loop {
            let step = {
                let (v1, v2) = m97;
                let m95 = v2;
                match m95.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Str>), List<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Str>), List<Bytes>>(({
                            let c96: Fn6 = v0.clone();
                            c96.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m97 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f31(v0: List<Bytes>, v1: Str) -> List<Bytes> {
    let a100 = v0;
    let a101 = List::cons(f55(v1), List::<Bytes>::nil());
    append_list(a100, a101)
}

pub fn f32(v0: Fn7, p105: Str, p106: List<Adt5>) -> Str {
    let m104 = (p105, p106);
    {
        let mut m104 = m104;
        loop {
            let step = {
                let (v1, v2) = m104;
                let m102 = v2;
                match m102.uncons() {
                    None => {
                        Err::<(Str, List<Adt5>), Str>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Str, List<Adt5>), Str>(({
                            let c103: Fn7 = v0.clone();
                            c103.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m104 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f33(v0: List<Str>, v1: Str, v2: Adt5) -> Str {
    if f58({
        let m109 = match v2.clone() {
            Adt5::C0(h108, _, _) => {
                h108
            }
        };
        match m109 {
            Adt6::C0(h107, _, _, _, _, _) => {
                h107
            }
        }
    }, v0) {
        let v3: Str = f60(match v2 {
            Adt5::C0(_, _, h110) => {
                h110
            }
        });
        let a111 = v1.clone();
        let a112 = Str::lit("failure");
        if equal(a111, a112) {
            v1
        } else {
            let a113 = v3.clone();
            let a114 = Str::lit("failure");
            if equal(a113, a114) {
                v3
            } else {
                let a115 = v1.clone();
                let a116 = Str::lit("success");
                if equal(a115, a116) {
                    v3
                } else {
                    v1
                }
            }
        }
    } else {
        v1
    }
}

pub fn f34(v0: Adt0, v1: Bytes) -> R<Adt0> {
    let v2: (Bytes, Bytes) = f62(v1)?;
    let v3: Bytes = {
        let (h117, _) = v2.clone();
        h117
    };
    let v4: (Bytes, Bytes) = f62({
        let (_, h118) = v2.clone();
        h118
    })?;
    let a119 = v3.clone();
    let a120 = f55(Str::lit("tree"));
    if equal(a119, a120) {
        Ok(Adt0::C0(List::cons(({
            let (h121, _) = v4;
            h121
        }, {
            let (_, h122) = v4;
            h122
        }), match v0.clone() {
            Adt0::C0(h123, _, _, _, _) => {
                h123
            }
        }), match v0.clone() {
            Adt0::C0(_, h124, _, _, _) => {
                h124
            }
        }, match v0.clone() {
            Adt0::C0(_, _, h125, _, _) => {
                h125
            }
        }, match v0.clone() {
            Adt0::C0(_, _, _, h126, _) => {
                h126
            }
        }, match v0 {
            Adt0::C0(_, _, _, _, h127) => {
                h127
            }
        }))
    } else {
        let a128 = v3.clone();
        let a129 = f55(Str::lit("signed"));
        if equal(a128, a129) {
            Ok(Adt0::C0(match v0.clone() {
                Adt0::C0(h130, _, _, _, _) => {
                    h130
                }
            }, {
                let v5: (Bytes, Bytes) = f62({
                    let (_, h131) = v4;
                    h131
                })?;
                let v6: (Bytes, Bytes) = f62({
                    let (_, h132) = v5;
                    h132
                })?;
                let v7: (Bytes, Bytes) = f62({
                    let (_, h133) = v6;
                    h133
                })?;
                let v8: (Bytes, Bytes) = f62({
                    let (_, h134) = v7;
                    h134
                })?;
                List::cons(Adt1::C0(f63({
                    let (h135, _) = v4;
                    h135
                }), f63({
                    let (h136, _) = v5;
                    h136
                }), f64({
                    let (h137, _) = v6;
                    h137
                }), f65({
                    let (h138, _) = v7;
                    h138
                }), f63({
                    let (_, h139) = v8;
                    h139
                }), f66({
                    let (h140, _) = v8;
                    h140
                })), match v0.clone() {
                    Adt0::C0(_, h141, _, _, _) => {
                        h141
                    }
                })
            }, match v0.clone() {
                Adt0::C0(_, _, h142, _, _) => {
                    h142
                }
            }, match v0.clone() {
                Adt0::C0(_, _, _, h143, _) => {
                    h143
                }
            }, match v0 {
                Adt0::C0(_, _, _, _, h144) => {
                    h144
                }
            }))
        } else {
            let a145 = v3.clone();
            let a146 = f55(Str::lit("trust-repository"));
            if equal(a145, a146) {
                Ok(Adt0::C0(match v0.clone() {
                    Adt0::C0(h147, _, _, _, _) => {
                        h147
                    }
                }, match v0.clone() {
                    Adt0::C0(_, h148, _, _, _) => {
                        h148
                    }
                }, f63({
                    let (_, h149) = v2;
                    h149
                }), match v0.clone() {
                    Adt0::C0(_, _, _, h150, _) => {
                        h150
                    }
                }, match v0 {
                    Adt0::C0(_, _, _, _, h151) => {
                        h151
                    }
                }))
            } else {
                let a152 = v3.clone();
                let a153 = f55(Str::lit("trust-maintainer"));
                if equal(a152, a153) {
                    Ok(Adt0::C0(match v0.clone() {
                        Adt0::C0(h154, _, _, _, _) => {
                            h154
                        }
                    }, match v0.clone() {
                        Adt0::C0(_, h155, _, _, _) => {
                            h155
                        }
                    }, match v0.clone() {
                        Adt0::C0(_, _, h156, _, _) => {
                            h156
                        }
                    }, List::cons(f63({
                        let (_, h157) = v2;
                        h157
                    }), match v0.clone() {
                        Adt0::C0(_, _, _, h158, _) => {
                            h158
                        }
                    }), match v0 {
                        Adt0::C0(_, _, _, _, h159) => {
                            h159
                        }
                    }))
                } else {
                    let a160 = v3;
                    let a161 = f55(Str::lit("event"));
                    if equal(a160, a161) {
                        Ok(Adt0::C0(match v0.clone() {
                            Adt0::C0(h162, _, _, _, _) => {
                                h162
                            }
                        }, match v0.clone() {
                            Adt0::C0(_, h163, _, _, _) => {
                                h163
                            }
                        }, match v0.clone() {
                            Adt0::C0(_, _, h164, _, _) => {
                                h164
                            }
                        }, match v0 {
                            Adt0::C0(_, _, _, h165, _) => {
                                h165
                            }
                        }, f67({
                            let (_, h166) = v2;
                            h166
                        })))
                    } else {
                        Ok(v0)
                    }
                }
            }
        }
    }
}

pub fn f35(v0: Fn8, p171: u64, p172: (u64, (u64, List<Bytes>))) -> R<((u64, (u64, List<Bytes>)), bool)> {
    let m170 = (p171, p172);
    {
        let mut m170 = m170;
        loop {
            let step = {
                let (v1, v2) = m170;
                let m167 = v1;
                if m167 == 0 {
                    Err::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>(Ok((v2, false)))
                } else {
                    let v3 = m167 - 1;
                    let m169 = {
                        let c168: Fn8 = v0.clone();
                        c168.apply(v2.clone())?
                    };
                    match m169 {
                        None => {
                            Err::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>(Ok((v2, true)))
                        }
                        Some(v4) => {
                            Ok::<(u64, (u64, (u64, List<Bytes>))), R<((u64, (u64, List<Bytes>)), bool)>>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m170 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f36(v0: Bytes, v1: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
    f68(v0, v1)
}

pub fn f37(v0: Bytes, v1: u64, v2: u64) -> Bytes {
    let m176 = {
        let a173 = v0;
        let a174 = v1;
        let a175 = v2;
        slice_bytes(a173, a174, a175)
    };
    match m176 {
        None => {
            Bytes::lit(&[])
        }
        Some(v3) => {
            v3
        }
    }
}

pub fn f38(v0: Fn9, p180: List<(Bytes, Bytes)>, p181: List<(Bytes, Bytes)>) -> List<(Bytes, Bytes)> {
    let m179 = (p180, p181);
    {
        let mut m179 = m179;
        loop {
            let step = {
                let (v1, v2) = m179;
                let m177 = v2;
                match m177.uncons() {
                    None => {
                        Err::<(List<(Bytes, Bytes)>, List<(Bytes, Bytes)>), List<(Bytes, Bytes)>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<(Bytes, Bytes)>, List<(Bytes, Bytes)>), List<(Bytes, Bytes)>>(({
                            let c178: Fn9 = v0.clone();
                            c178.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m179 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f39(v0: List<(Bytes, Bytes)>, v1: (Bytes, Bytes)) -> List<(Bytes, Bytes)> {
    List::cons(v1, v0)
}

pub fn f40(v0: Str) -> bool {
    f58(v0, f69())
}

pub fn f41(v0: List<Adt6>) -> List<Str> {
    f70(Fn12::F71, List::<Str>::nil(), v0)
}

pub fn f42() -> List<Adt6> {
    f72(f73())
}

pub fn f43(v0: List<Adt6>) -> List<Str> {
    f70(Fn12::F74, List::<Str>::nil(), v0)
}

pub fn f44() -> List<Adt6> {
    f72(f75())
}

pub fn f45(v0: List<(Bytes, Bytes)>, v1: List<(Str, bool)>, v2: (List<Adt5>, List<(List<Str>, Str)>), v3: Adt6) -> R<(List<Adt5>, List<(List<Str>, Str)>)> {
    let v4: List<Adt5> = {
        let (h182, _) = v2;
        h182
    };
    let v5: List<(List<Str>, Str)> = {
        let (_, h183) = v2;
        h183
    };
    let v6: List<Str> = match v3.clone() {
        Adt6::C0(_, _, _, _, h184, _) => {
            h184
        }
    };
    let v8: Str = {
        let m185 = f76(v6.clone(), v5.clone());
        match m185 {
            None => {
                f77(v6.clone(), v0)?
            }
            Some(v7) => {
                v7
            }
        }
    };
    let v9: List<Adt5> = f78(match v3.clone() {
        Adt6::C0(_, _, _, _, _, h186) => {
            h186
        }
    }, v4.clone());
    let v10: Str = f79(v3.clone(), v8.clone(), v9.clone())?;
    let v11: List<Adt8> = if f80(match v3.clone() {
        Adt6::C0(_, _, _, _, _, h187) => {
            h187
        }
    }, v4.clone()) {
        f81(v9)
    } else {
        List::cons(Adt8::C3, List::<Adt8>::nil())
    };
    Ok(({
        let a189 = v4;
        let a190 = List::cons(Adt5::C0(v3.clone(), v10.clone(), f82(match v3 {
            Adt6::C0(_, h188, _, _, _, _) => {
                h188
            }
        }, v10, v1, v11)), List::<Adt5>::nil());
        append_list(a189, a190)
    }, List::cons((v6, v8), v5)))
}

pub fn f46(v0: Adt6) -> Adt6 {
    Adt6::C0(match v0.clone() {
        Adt6::C0(h191, _, _, _, _, _) => {
            h191
        }
    }, match v0.clone() {
        Adt6::C0(_, h192, _, _, _, _) => {
            h192
        }
    }, f63(f56(match v0.clone() {
        Adt6::C0(h193, _, _, _, _, _) => {
            h193
        }
    })), match v0.clone() {
        Adt6::C0(_, _, _, h194, _, _) => {
            h194
        }
    }, match v0.clone() {
        Adt6::C0(_, _, _, _, h195, _) => {
            h195
        }
    }, match v0 {
        Adt6::C0(_, _, _, _, _, h196) => {
            h196
        }
    })
}

pub fn f47(v0: Adt1, v1: Adt9) -> bool {
    let m198 = match v0.clone() {
        Adt1::C0(_, _, _, h197, _, _) => {
            h197
        }
    };
    match m198 {
        Adt2::C0 => {
            let a201 = match v0 {
                Adt1::C0(_, _, _, _, h199, _) => {
                    h199
                }
            };
            let a202 = match v1 {
                Adt9::C0(h200, _) => {
                    h200
                }
            };
            equal(a201, a202)
        }
        Adt2::C1 => {
            f58(match v0 {
                Adt1::C0(_, _, _, _, h203, _) => {
                    h203
                }
            }, match v1 {
                Adt9::C0(_, h204) => {
                    h204
                }
            })
        }
        Adt2::C2 => {
            false
        }
    }
}

pub fn f48(v0: Fn10, p209: u64, p210: List<Bytes>) -> (List<Bytes>, bool) {
    let m208 = (p209, p210);
    {
        let mut m208 = m208;
        loop {
            let step = {
                let (v1, v2) = m208;
                let m205 = v1;
                if m205 == 0 {
                    Err::<(u64, List<Bytes>), (List<Bytes>, bool)>((v2, false))
                } else {
                    let v3 = m205 - 1;
                    let m207 = {
                        let c206: Fn10 = v0.clone();
                        c206.apply(v2.clone())
                    };
                    match m207 {
                        None => {
                            Err::<(u64, List<Bytes>), (List<Bytes>, bool)>((v2, true))
                        }
                        Some(v4) => {
                            Ok::<(u64, List<Bytes>), (List<Bytes>, bool)>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m208 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f49(v0: List<Bytes>) -> Option<List<Bytes>> {
    f83(v0)
}

pub fn f50(v0: Fn11, p214: List<Bytes>, p215: List<Bytes>) -> List<Bytes> {
    let m213 = (p214, p215);
    {
        let mut m213 = m213;
        loop {
            let step = {
                let (v1, v2) = m213;
                let m211 = v2;
                match m211.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<Bytes>), List<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<Bytes>), List<Bytes>>(({
                            let c212: Fn11 = v0.clone();
                            c212.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m213 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f51(v0: List<Bytes>, v1: Bytes) -> List<Bytes> {
    List::cons(v1, v0)
}

pub fn f52(v0: Str) -> Adt10 {
    f84(Fn13::F85(v0), f86(Str::lit("@sdk"), Adt11::C0), f87())
}

pub fn f53(v0: Adt8) -> Str {
    let m216 = v0;
    match m216 {
        Adt8::C0 => {
            Str::lit("proved")
        }
        Adt8::C1 => {
            Str::lit("observe")
        }
        Adt8::C2 => {
            Str::lit("refuted")
        }
        Adt8::C3 => {
            Str::lit("blocked")
        }
    }
}

pub fn f54(v0: Adt11) -> Str {
    let m217 = v0;
    match m217 {
        Adt11::C0 => {
            Str::lit("sealed")
        }
        Adt11::C1 => {
            Str::lit("pinned")
        }
        Adt11::C2 => {
            Str::lit("live")
        }
    }
}

pub fn f55(v0: Str) -> Bytes {
    let a218 = v0;
    utf8_encode(a218)
}

pub fn f56(v0: Str) -> Bytes {
    let v1: Adt10 = f52(v0);
    f61(List::cons({
        let a219 = Str::lit("prism/1");
        utf8_encode(a219)
    }, List::cons({
        let a220 = f88(v1.clone());
        utf8_encode(a220)
    }, List::cons({
        let a222 = match v1.clone() {
            Adt10::C0(_, h221, _, _, _, _) => {
                h221
            }
        };
        utf8_encode(a222)
    }, List::cons({
        let a224 = match v1.clone() {
            Adt10::C0(_, _, h223, _, _, _) => {
                h223
            }
        };
        utf8_encode(a224)
    }, List::cons({
        let a226 = match v1.clone() {
            Adt10::C0(_, _, _, h225, _, _) => {
                h225
            }
        };
        utf8_encode(a226)
    }, List::cons({
        let a228 = match v1.clone() {
            Adt10::C0(_, _, _, _, h227, _) => {
                h227
            }
        };
        utf8_encode(a228)
    }, List::cons({
        let a230 = f54(match v1 {
            Adt10::C0(_, _, _, _, _, h229) => {
                h229
            }
        });
        utf8_encode(a230)
    }, List::<Bytes>::nil()))))))), Bytes::lit(&[0x20]))
}

pub fn f57(v0: Adt8) -> bool {
    let m231 = v0;
    match m231 {
        Adt8::C0 => {
            false
        }
        Adt8::C1 => {
            true
        }
        Adt8::C2 => {
            false
        }
        Adt8::C3 => {
            false
        }
    }
}

pub fn f58(v0: Str, v1: List<Str>) -> bool {
    f89(Fn14::F90(v0), false, v1)
}

pub fn f59(v0: Str, v1: List<Str>, v2: List<(Bytes, Bytes)>) -> R<Bytes> {
    Ok(f6(f91(Fn15::F92(v1, v0), List::<Bytes>::nil(), v2)?))
}

pub fn f60(v0: Adt8) -> Str {
    if f93(v0.clone()) {
        Str::lit("success")
    } else {
        let a232 = f53(v0);
        let a233 = Str::lit("refuted");
        if equal(a232, a233) {
            Str::lit("failure")
        } else {
            Str::lit("pending")
        }
    }
}

pub fn f61(v0: List<Bytes>, v1: Bytes) -> Bytes {
    let m234 = f94(Fn16::F95(v1), None::<Bytes>, v0);
    match m234 {
        None => {
            Bytes::lit(&[])
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f62(v0: Bytes) -> R<(Bytes, Bytes)> {
    let m235 = f96(v0.clone(), Bytes::lit(&[0x20]))?;
    match m235 {
        None => {
            Ok((v0, Bytes::lit(&[])))
        }
        Some(v1) => {
            Ok((f37(v0.clone(), 0u64, v1), f37(v0.clone(), {
                let a236 = v1;
                let a237 = 1u64;
                nat_add(a236, a237)?
            }, {
                let a241 = {
                    let a238 = v0;
                    length_bytes(a238)
                };
                let a242 = {
                    let a239 = v1;
                    let a240 = 1u64;
                    nat_add(a239, a240)?
                };
                nat_sub(a241, a242)
            })))
        }
    }
}

pub fn f63(v0: Bytes) -> Str {
    let m244 = {
        let a243 = v0;
        utf8_decode(a243)
    };
    match m244 {
        None => {
            Str::lit("")
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f64(v0: Bytes) -> bool {
    let a245 = v0;
    let a246 = f55(Str::lit("pass"));
    equal(a245, a246)
}

pub fn f65(v0: Bytes) -> Adt2 {
    let a247 = v0.clone();
    let a248 = f55(Str::lit("workflow"));
    if equal(a247, a248) {
        Adt2::C0
    } else {
        let a249 = v0;
        let a250 = f55(Str::lit("maintainer"));
        if equal(a249, a250) {
            Adt2::C1
        } else {
            Adt2::C2
        }
    }
}

pub fn f66(v0: Bytes) -> Adt3 {
    let a251 = v0.clone();
    let a252 = f55(Str::lit("workstation"));
    if equal(a251, a252) {
        Adt3::C1
    } else {
        let a253 = v0;
        let a254 = f55(Str::lit("browser"));
        if equal(a253, a254) {
            Adt3::C2
        } else {
            Adt3::C0
        }
    }
}

pub fn f67(v0: Bytes) -> Adt4 {
    let a255 = v0.clone();
    let a256 = f55(Str::lit("pull_request"));
    if equal(a255, a256) {
        Adt4::C0
    } else {
        let a257 = v0.clone();
        let a258 = f55(Str::lit("push"));
        if equal(a257, a258) {
            Adt4::C1
        } else {
            let a259 = v0;
            let a260 = f55(Str::lit("tag"));
            if equal(a259, a260) {
                Adt4::C2
            } else {
                Adt4::C3
            }
        }
    }
}

pub fn f68(v0: Bytes, v1: (u64, (u64, List<Bytes>))) -> R<Option<(u64, (u64, List<Bytes>))>> {
    let v2: u64 = {
        let (h261, _) = v1.clone();
        h261
    };
    let v3: u64 = {
        let (h262, _) = {
            let (_, h263) = v1.clone();
            h263
        };
        h262
    };
    let v4: List<Bytes> = {
        let (_, h264) = {
            let (_, h265) = v1;
            h265
        };
        h264
    };
    let m266 = f97(v0.clone(), v2);
    match m266 {
        None => {
            Ok(None::<(u64, (u64, List<Bytes>))>)
        }
        Some(v5) => {
            let a267 = v5;
            let a268 = 10u8;
            if equal(a267, a268) {
                Ok(Some(({
                    let a269 = v2;
                    let a270 = 1u64;
                    nat_add(a269, a270)?
                }, ({
                    let a271 = v2;
                    let a272 = 1u64;
                    nat_add(a271, a272)?
                }, List::cons(f98(f37(v0, v3, {
                    let a273 = v2;
                    let a274 = v3;
                    nat_sub(a273, a274)
                })), v4)))))
            } else {
                Ok(Some(({
                    let a275 = v2;
                    let a276 = 1u64;
                    nat_add(a275, a276)?
                }, (v3, v4))))
            }
        }
    }
}

pub fn f69() -> List<Str> {
    List::cons(Str::lit("factory-model"), List::cons(Str::lit("lint"), List::cons(Str::lit("model-audits"), List::cons(Str::lit("fixtures-golden"), List::<Str>::nil()))))
}

pub fn f70(v0: Fn12, p280: List<Str>, p281: List<Adt6>) -> List<Str> {
    let m279 = (p280, p281);
    {
        let mut m279 = m279;
        loop {
            let step = {
                let (v1, v2) = m279;
                let m277 = v2;
                match m277.uncons() {
                    None => {
                        Err::<(List<Str>, List<Adt6>), List<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Str>, List<Adt6>), List<Str>>(({
                            let c278: Fn12 = v0.clone();
                            c278.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m279 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f71(v0: List<Str>, v1: Adt6) -> List<Str> {
    if f99(v1.clone()) {
        let a283 = v0;
        let a284 = List::cons(match v1 {
            Adt6::C0(h282, _, _, _, _, _) => {
                h282
            }
        }, List::<Str>::nil());
        append_list(a283, a284)
    } else {
        v0
    }
}

pub fn f72(v0: List<Adt6>) -> List<Adt6> {
    f21(Fn4::F100, List::<Adt6>::nil(), v0)
}

pub fn f73() -> List<Adt6> {
    List::cons(f101(Str::lit("policy"), Adt7::C0, Str::lit("actions"), Str::lit("release.yml/policy"), List::cons(Str::lit(".github/workflows/release.yml"), List::cons(Str::lit("Cargo.toml"), List::cons(Str::lit("model/errors.toml"), List::cons(Str::lit("scripts/"), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil())))))), List::<Str>::nil()), List::cons(f101(Str::lit("factory-model"), Adt7::C0, Str::lit("host"), Str::lit("bash prism-factory/check.sh"), List::cons(Str::lit(".github/workflows/factory.yml"), List::cons(Str::lit(".github/workflows/prism-delegation.yml"), List::cons(Str::lit(".github/workflows/release-cut.yml"), List::cons(Str::lit(".github/workflows/release.yml"), List::cons(Str::lit("prism-factory/"), List::cons(Str::lit("vendor/lexlean/"), List::<Str>::nil())))))), List::<Str>::nil()), List::cons(f101(Str::lit("plumbing"), Adt7::C0, Str::lit("actions"), Str::lit("release.yml/devcontainer-image"), List::cons(Str::lit(""), List::cons(Str::lit("@run"), List::<Str>::nil())), List::cons(Str::lit("policy"), List::<Str>::nil())), List::cons(f101(Str::lit("vv-sdk"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/vv-sdk"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.mjs"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/release-rebuild.sh"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/vv-sdk.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))), List::<Str>::nil()), List::cons(f101(Str::lit("source-vv"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/source-vv"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.mjs"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/release-rebuild.sh"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/source-vv.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))), List::cons(Str::lit("vv-sdk"), List::<Str>::nil())), List::cons(f101(Str::lit("build"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/build"), List::cons(Str::lit(""), List::cons(Str::lit("!.github/workflows/release-cut.yml"), List::cons(Str::lit("!.github/workflows/release-qualify.yml"), List::cons(Str::lit("!.github/workflows/release.yml"), List::cons(Str::lit("!factory/"), List::cons(Str::lit("!scripts/browser-api-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/ci-capacity.test.mjs"), List::cons(Str::lit("!scripts/factory.mjs"), List::cons(Str::lit("!scripts/factory.test.mjs"), List::cons(Str::lit("!scripts/lexlean-pin.test.mjs"), List::cons(Str::lit("!scripts/library-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/product-sdk-check.test.mjs"), List::cons(Str::lit("!scripts/release-gate-evidence.test.mjs"), List::cons(Str::lit("!scripts/release-native-contract.test.mjs"), List::cons(Str::lit("!scripts/release-phases.md"), List::cons(Str::lit("!scripts/release-phases.test.mjs"), List::cons(Str::lit("!scripts/release-publication.mjs"), List::cons(Str::lit("!scripts/release-publication.test.mjs"), List::cons(Str::lit("!scripts/rust-oracle-tools-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-candidate-sbom.test.mjs"), List::cons(Str::lit("!scripts/sdk-construction-handoff.test.mjs"), List::cons(Str::lit("!scripts/sdk-image-inputs.test.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.mjs"), List::cons(Str::lit("!scripts/sdk-release-evidence.test.mjs"), List::cons(Str::lit("!scripts/sdk-vv-check.test.mjs"), List::cons(Str::lit("!scripts/unpublished-sdk-qualification.test.mjs"), List::cons(Str::lit("!prism-factory/"), List::cons(Str::lit("scripts/release-gate-evidence.mjs"), List::cons(Str::lit("scripts/release-phases.mjs"), List::cons(Str::lit("scripts/release-rebuild.sh"), List::cons(Str::lit("prism-factory/jobs/header.yml"), List::cons(Str::lit("prism-factory/jobs/image-platforms.yml"), List::cons(Str::lit("prism-factory/jobs/images.yml"), List::cons(Str::lit("prism-factory/jobs/reproducibility.yml"), List::cons(Str::lit("prism-factory/jobs/native.yml"), List::cons(Str::lit("prism-factory/jobs/installed-sdk.yml"), List::<Str>::nil())))))))))))))))))))))))))))))))))))), List::<Str>::nil()), List::cons(f101(Str::lit("gate"), Adt7::C0, Str::lit("actions"), Str::lit("release.yml/gate"), List::cons(Str::lit(""), List::cons(Str::lit("@run"), List::<Str>::nil())), List::cons(Str::lit("plumbing"), List::cons(Str::lit("source-vv"), List::<Str>::nil()))), List::cons(f101(Str::lit("oci-native"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/oci-native"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("gate"), List::cons(Str::lit("build"), List::<Str>::nil()))), List::cons(f101(Str::lit("crates"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/crates"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("oci-native"), List::<Str>::nil())), List::cons(f101(Str::lit("release"), Adt7::C1, Str::lit("actions"), Str::lit("release.yml/release"), List::cons(Str::lit(""), List::cons(Str::lit("@mode"), List::cons(Str::lit("@run"), List::<Str>::nil()))), List::cons(Str::lit("factory-model"), List::cons(Str::lit("crates"), List::<Str>::nil()))), List::<Adt6>::nil()))))))))))
}

pub fn f74(v0: List<Str>, v1: Adt6) -> List<Str> {
    let a286 = v0;
    let a287 = List::cons(match v1 {
        Adt6::C0(h285, _, _, _, _, _) => {
            h285
        }
    }, List::<Str>::nil());
    append_list(a286, a287)
}

pub fn f75() -> List<Adt6> {
    List::cons(f101(Str::lit("lint"), Adt7::C1, Str::lit("prism"), Str::lit("cargo fetch --locked && cargo fmt --check && cargo clippy --workspace --all-targets --all-features --locked --offline -- -D warnings && cargo deny fetch && cargo deny --frozen --all-features check"), List::cons(Str::lit(""), List::<Str>::nil()), List::<Str>::nil()), List::cons(f101(Str::lit("model-audits"), Adt7::C1, Str::lit("prism"), Str::lit("cargo fetch --locked && bash scripts/fetch-oracle-cargo.sh && cargo xtask validate"), List::cons(Str::lit(""), List::<Str>::nil()), List::<Str>::nil()), List::cons(f101(Str::lit("fixtures-golden"), Adt7::C1, Str::lit("prism"), Str::lit("cargo fetch --locked && bash scripts/fetch-oracle-cargo.sh && cargo xtask check-fixtures && cargo run --locked --offline --manifest-path tests/holo-codec-oracle/Cargo.toml --target-dir target/holo-codec-oracle && cargo xtask check-golden"), List::cons(Str::lit(""), List::<Str>::nil()), List::<Str>::nil()), List::<Adt6>::nil())))
}

pub fn f76(v0: List<Str>, v1: List<(List<Str>, Str)>) -> Option<Str> {
    f102(Fn17::F103(v0), None::<Str>, v1)
}

pub fn f77(v0: List<Str>, v1: List<(Bytes, Bytes)>) -> R<Str> {
    Ok(f63(f104(f105(v0, v1)?)?))
}

pub fn f78(v0: List<Str>, v1: List<Adt5>) -> List<Adt5> {
    f106(Fn18::F107(v1), List::<Adt5>::nil(), v0)
}

pub fn f79(v0: Adt6, v1: Str, v2: List<Adt5>) -> R<Str> {
    Ok(f63(f104(f108(v0, v1, v2)?)?))
}

pub fn f80(v0: List<Str>, v1: List<Adt5>) -> bool {
    f89(Fn14::F109(v1), true, v0)
}

pub fn f81(v0: List<Adt5>) -> List<Adt8> {
    f110(Fn19::F111, List::<Adt8>::nil(), v0)
}

pub fn f82(v0: Adt7, v1: Str, v2: List<(Str, bool)>, v3: List<Adt8>) -> Adt8 {
    if f112(v3) {
        let m288 = f113(v1, v2);
        match m288 {
            None => {
                Adt8::C1
            }
            Some(v4) => {
                if v4 {
                    Adt8::C0
                } else {
                    let m289 = v0;
                    match m289 {
                        Adt7::C0 => {
                            Adt8::C2
                        }
                        Adt7::C1 => {
                            Adt8::C1
                        }
                    }
                }
            }
        }
    } else {
        Adt8::C3
    }
}

pub fn f83(v0: List<Bytes>) -> Option<List<Bytes>> {
    let m290 = v0.clone();
    match m290.uncons() {
        None => {
            None::<List<Bytes>>
        }
        Some((_, v2)) => {
            let m291 = v2;
            match m291.uncons() {
                None => {
                    None::<List<Bytes>>
                }
                Some((_, _)) => {
                    let v5: (Option<Bytes>, List<Bytes>) = f114(Fn20::F115, (None::<Bytes>, List::<Bytes>::nil()), v0);
                    let m293 = {
                        let (h292, _) = v5;
                        h292
                    };
                    match m293 {
                        None => {
                            Some(f27({
                                let (_, h295) = v5;
                                h295
                            }))
                        }
                        Some(v6) => {
                            Some(f27(List::cons(v6, {
                                let (_, h294) = v5;
                                h294
                            })))
                        }
                    }
                }
            }
        }
    }
}

pub fn f84(v0: Fn13, p299: Adt10, p300: List<(Str, Adt10)>) -> Adt10 {
    let m298 = (p299, p300);
    {
        let mut m298 = m298;
        loop {
            let step = {
                let (v1, v2) = m298;
                let m296 = v2;
                match m296.uncons() {
                    None => {
                        Err::<(Adt10, List<(Str, Adt10)>), Adt10>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Adt10, List<(Str, Adt10)>), Adt10>(({
                            let c297: Fn13 = v0.clone();
                            c297.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m298 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f85(v0: Str, v1: Adt10, v2: (Str, Adt10)) -> Adt10 {
    let a302 = {
        let (h301, _) = v2;
        h301
    };
    let a303 = v0;
    if equal(a302, a303) {
        let (_, h304) = v2;
        h304
    } else {
        v1
    }
}

pub fn f86(v0: Str, v1: Adt11) -> Adt10 {
    Adt10::C0(v0, Str::lit("1000:1000"), Str::lit("0022"), Str::lit("tmp/prismpm-home"), Str::lit("tmp"), v1)
}

pub fn f87() -> List<(Str, Adt10)> {
    List::cons((Str::lit("policy"), f86(Str::lit("@sdk"), Adt11::C0)), List::cons((Str::lit("factory-model"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("plumbing"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("vv-sdk"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("source-vv"), f86(Str::lit("@vv-sdk"), Adt11::C0)), List::cons((Str::lit("build"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("gate"), f86(Str::lit("@vv-sdk"), Adt11::C0)), List::cons((Str::lit("oci-native"), f86(Str::lit("@build"), Adt11::C1)), List::cons((Str::lit("crates"), f86(Str::lit("@build"), Adt11::C1)), List::cons((Str::lit("release"), f86(Str::lit("@build"), Adt11::C1)), List::cons((Str::lit("lint"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("model-audits"), f86(Str::lit("@sdk"), Adt11::C1)), List::cons((Str::lit("fixtures-golden"), f86(Str::lit("@sdk"), Adt11::C1)), List::<(Str, Adt10)>::nil())))))))))))))
}

pub fn f88(v0: Adt10) -> Str {
    let a306 = match v0.clone() {
        Adt10::C0(h305, _, _, _, _, _) => {
            h305
        }
    };
    let a307 = Str::lit("@sdk");
    if equal(a306, a307) {
        f10()
    } else {
        match v0 {
            Adt10::C0(h308, _, _, _, _, _) => {
                h308
            }
        }
    }
}

pub fn f89(v0: Fn14, p312: bool, p313: List<Str>) -> bool {
    let m311 = (p312, p313);
    {
        let mut m311 = m311;
        loop {
            let step = {
                let (v1, v2) = m311;
                let m309 = v2;
                match m309.uncons() {
                    None => {
                        Err::<(bool, List<Str>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<Str>), bool>(({
                            let c310: Fn14 = v0.clone();
                            c310.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m311 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f90(v0: Str, v1: bool, v2: Str) -> bool {
    if v1 {
        true
    } else {
        let a314 = v2;
        let a315 = v0;
        equal(a314, a315)
    }
}

pub fn f91(v0: Fn15, p319: List<Bytes>, p320: List<(Bytes, Bytes)>) -> R<List<Bytes>> {
    let m318 = (p319, p320);
    {
        let mut m318 = m318;
        loop {
            let step = {
                let (v1, v2) = m318;
                let m316 = v2;
                match m316.uncons() {
                    None => {
                        Err::<(List<Bytes>, List<(Bytes, Bytes)>), R<List<Bytes>>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Bytes>, List<(Bytes, Bytes)>), R<List<Bytes>>>(({
                            let c317: Fn15 = v0.clone();
                            c317.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m318 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f92(v0: List<Str>, v1: Str, v2: List<Bytes>, v3: (Bytes, Bytes)) -> R<List<Bytes>> {
    if f116(v0, {
        let (_, h321) = v3.clone();
        h321
    })? {
        Ok(List::cons(f29(List::cons(f55(Str::lit("file")), List::cons(f55(v1), List::cons({
            let (_, h322) = v3;
            h322
        }, List::<Bytes>::nil())))), v2))
    } else {
        Ok(v2)
    }
}

pub fn f93(v0: Adt8) -> bool {
    let m323 = v0;
    match m323 {
        Adt8::C0 => {
            true
        }
        Adt8::C1 => {
            false
        }
        Adt8::C2 => {
            false
        }
        Adt8::C3 => {
            false
        }
    }
}

pub fn f94(v0: Fn16, p327: Option<Bytes>, p328: List<Bytes>) -> Option<Bytes> {
    let m326 = (p327, p328);
    {
        let mut m326 = m326;
        loop {
            let step = {
                let (v1, v2) = m326;
                let m324 = v2;
                match m324.uncons() {
                    None => {
                        Err::<(Option<Bytes>, List<Bytes>), Option<Bytes>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Bytes>, List<Bytes>), Option<Bytes>>(({
                            let c325: Fn16 = v0.clone();
                            c325.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m326 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f95(v0: Bytes, v1: Option<Bytes>, v2: Bytes) -> Option<Bytes> {
    let m329 = v1;
    match m329 {
        None => {
            Some(v2)
        }
        Some(v3) => {
            Some({
                let a332 = {
                    let a330 = v3;
                    let a331 = v0;
                    append_bytes(a330, a331)
                };
                let a333 = v2;
                append_bytes(a332, a333)
            })
        }
    }
}

pub fn f96(v0: Bytes, v1: Bytes) -> R<Option<u64>> {
    let v2: u64 = {
        let a334 = v0.clone();
        length_bytes(a334)
    };
    let v3: u64 = {
        let a335 = v1.clone();
        length_bytes(a335)
    };
    let v4: u64 = {
        let (h336, _) = f117(Fn21::F118(v1.clone(), v3, v0.clone(), v2), {
            let a337 = v2;
            let a338 = 1u64;
            nat_add(a337, a338)?
        }, 0u64)?;
        h336
    };
    if f119(v0, v1, v4) {
        Ok(Some(v4))
    } else {
        Ok(None::<u64>)
    }
}

pub fn f97(v0: Bytes, v1: u64) -> Option<u8> {
    let a339 = v0;
    let a340 = v1;
    index_bytes(a339, a340)
}

pub fn f98(v0: Bytes) -> Bytes {
    if f120(v0.clone(), Bytes::lit(&[0x0d])) {
        f37(v0.clone(), 0u64, {
            let a342 = {
                let a341 = v0;
                length_bytes(a341)
            };
            let a343 = 1u64;
            nat_sub(a342, a343)
        })
    } else {
        v0
    }
}

pub fn f99(v0: Adt6) -> bool {
    let a345 = f58(Str::lit("@mode"), match v0.clone() {
        Adt6::C0(_, _, _, _, h344, _) => {
            h344
        }
    });
    if bool_not(a345) {
        let a347 = f58(Str::lit("@run"), match v0 {
            Adt6::C0(_, _, _, _, h346, _) => {
                h346
            }
        });
        bool_not(a347)
    } else {
        false
    }
}

pub fn f100(v0: List<Adt6>, v1: Adt6) -> List<Adt6> {
    let a348 = v0;
    let a349 = List::cons(f121(v1), List::<Adt6>::nil());
    append_list(a348, a349)
}

pub fn f101(v0: Str, v1: Adt7, v2: Str, v3: Str, v4: List<Str>, v5: List<Str>) -> Adt6 {
    Adt6::C0(v0, v1, v2, v3, v4, v5)
}

pub fn f102(v0: Fn17, p353: Option<Str>, p354: List<(List<Str>, Str)>) -> Option<Str> {
    let m352 = (p353, p354);
    {
        let mut m352 = m352;
        loop {
            let step = {
                let (v1, v2) = m352;
                let m350 = v2;
                match m350.uncons() {
                    None => {
                        Err::<(Option<Str>, List<(List<Str>, Str)>), Option<Str>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Str>, List<(List<Str>, Str)>), Option<Str>>(({
                            let c351: Fn17 = v0.clone();
                            c351.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m352 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f103(v0: List<Str>, v1: Option<Str>, v2: (List<Str>, Str)) -> Option<Str> {
    if f122({
        let (h355, _) = v2;
        h355
    }, v0) {
        Some({
            let (_, h356) = v2;
            h356
        })
    } else {
        v1
    }
}

pub fn f104(v0: Bytes) -> R<Bytes> {
    Ok(f123(f124(v0)?))
}

pub fn f105(v0: List<Str>, v1: List<(Bytes, Bytes)>) -> R<Bytes> {
    Ok(f6(f91(Fn15::F125(v0), List::<Bytes>::nil(), v1)?))
}

pub fn f106(v0: Fn18, p360: List<Adt5>, p361: List<Str>) -> List<Adt5> {
    let m359 = (p360, p361);
    {
        let mut m359 = m359;
        loop {
            let step = {
                let (v1, v2) = m359;
                let m357 = v2;
                match m357.uncons() {
                    None => {
                        Err::<(List<Adt5>, List<Str>), List<Adt5>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt5>, List<Str>), List<Adt5>>(({
                            let c358: Fn18 = v0.clone();
                            c358.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m359 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f107(v0: List<Adt5>, v1: List<Adt5>, v2: Str) -> List<Adt5> {
    let m362 = f126(v2, v0);
    match m362 {
        None => {
            v1
        }
        Some(v3) => {
            let a363 = v1;
            let a364 = List::cons(v3, List::<Adt5>::nil());
            append_list(a363, a364)
        }
    }
}

pub fn f108(v0: Adt6, v1: Str, v2: List<Adt5>) -> R<Bytes> {
    Ok(f26(List::cons(f29(List::cons(f55(Str::lit("prism-factory/obligation/1")), List::<Bytes>::nil())), List::cons(f29(List::cons(f55(Str::lit("name")), List::cons(f55(match v0.clone() {
        Adt6::C0(h365, _, _, _, _, _) => {
            h365
        }
    }), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("kind")), List::cons(f55(f127(match v0.clone() {
        Adt6::C0(_, h366, _, _, _, _) => {
            h366
        }
    })), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("environment")), List::cons(f55(match v0.clone() {
        Adt6::C0(_, _, h367, _, _, _) => {
            h367
        }
    }), List::<Bytes>::nil()))), List::cons(f29(List::cons(f55(Str::lit("run")), List::cons(f55(match v0.clone() {
        Adt6::C0(_, _, _, h368, _, _) => {
            h368
        }
    }), List::<Bytes>::nil()))), List::cons(f128(Str::lit("input"), match v0 {
        Adt6::C0(_, _, _, _, h369, _) => {
            h369
        }
    }), List::cons(f129(v2)?, List::cons(f29(List::cons(f55(Str::lit("closure")), List::cons(f55(v1), List::<Bytes>::nil()))), List::<Bytes>::nil()))))))))))
}

pub fn f109(v0: List<Adt5>, v1: bool, v2: Str) -> bool {
    let m370 = f126(v2, v0);
    match m370 {
        None => {
            false
        }
        Some(_) => {
            v1
        }
    }
}

pub fn f110(v0: Fn19, p374: List<Adt8>, p375: List<Adt5>) -> List<Adt8> {
    let m373 = (p374, p375);
    {
        let mut m373 = m373;
        loop {
            let step = {
                let (v1, v2) = m373;
                let m371 = v2;
                match m371.uncons() {
                    None => {
                        Err::<(List<Adt8>, List<Adt5>), List<Adt8>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(List<Adt8>, List<Adt5>), List<Adt8>>(({
                            let c372: Fn19 = v0.clone();
                            c372.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m373 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f111(v0: List<Adt8>, v1: Adt5) -> List<Adt8> {
    let a377 = v0;
    let a378 = List::cons(match v1 {
        Adt5::C0(_, _, h376) => {
            h376
        }
    }, List::<Adt8>::nil());
    append_list(a377, a378)
}

pub fn f112(v0: List<Adt8>) -> bool {
    f130(Fn22::F131, true, v0)
}

pub fn f113(v0: Str, v1: List<(Str, bool)>) -> Option<bool> {
    f132(Fn23::F133(v0), None::<bool>, v1)
}

pub fn f114(v0: Fn20, p382: (Option<Bytes>, List<Bytes>), p383: List<Bytes>) -> (Option<Bytes>, List<Bytes>) {
    let m381 = (p382, p383);
    {
        let mut m381 = m381;
        loop {
            let step = {
                let (v1, v2) = m381;
                let m379 = v2;
                match m379.uncons() {
                    None => {
                        Err::<((Option<Bytes>, List<Bytes>), List<Bytes>), (Option<Bytes>, List<Bytes>)>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<((Option<Bytes>, List<Bytes>), List<Bytes>), (Option<Bytes>, List<Bytes>)>(({
                            let c380: Fn20 = v0.clone();
                            c380.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m381 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f115(v0: (Option<Bytes>, List<Bytes>), v1: Bytes) -> (Option<Bytes>, List<Bytes>) {
    f134(v0, v1)
}

pub fn f116(v0: List<Str>, v1: Bytes) -> R<bool> {
    let a384 = f135(v0.clone(), v1.clone(), true)?;
    let a385 = f135(v0, v1, false)?;
    Ok(nat_lt(a384, a385))
}

pub fn f117(v0: Fn21, p390: u64, p391: u64) -> R<(u64, bool)> {
    let m389 = (p390, p391);
    {
        let mut m389 = m389;
        loop {
            let step = {
                let (v1, v2) = m389;
                let m386 = v1;
                if m386 == 0 {
                    Err::<(u64, u64), R<(u64, bool)>>(Ok((v2, false)))
                } else {
                    let v3 = m386 - 1;
                    let m388 = {
                        let c387: Fn21 = v0.clone();
                        c387.apply(v2)?
                    };
                    match m388 {
                        None => {
                            Err::<(u64, u64), R<(u64, bool)>>(Ok((v2, true)))
                        }
                        Some(v4) => {
                            Ok::<(u64, u64), R<(u64, bool)>>((v3, v4))
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m389 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f118(v0: Bytes, v1: u64, v2: Bytes, v3: u64, v4: u64) -> R<Option<u64>> {
    if f119(v2, v0, v4) {
        Ok(None::<u64>)
    } else {
        let a394 = {
            let a392 = v4;
            let a393 = v1;
            nat_add(a392, a393)?
        };
        let a395 = v3;
        if nat_lt(a394, a395) {
            Ok(Some({
                let a396 = v4;
                let a397 = 1u64;
                nat_add(a396, a397)?
            }))
        } else {
            Ok(None::<u64>)
        }
    }
}

pub fn f119(v0: Bytes, v1: Bytes, v2: u64) -> bool {
    let m402 = {
        let a399 = v0;
        let a400 = v2;
        let a401 = {
            let a398 = v1.clone();
            length_bytes(a398)
        };
        slice_bytes(a399, a400, a401)
    };
    match m402 {
        None => {
            false
        }
        Some(v3) => {
            let a403 = v3;
            let a404 = v1;
            equal(a403, a404)
        }
    }
}

pub fn f120(v0: Bytes, v1: Bytes) -> bool {
    let v2: u64 = {
        let a405 = v0.clone();
        length_bytes(a405)
    };
    let v3: u64 = {
        let a406 = v1.clone();
        length_bytes(a406)
    };
    let a407 = v3;
    let a408 = v2;
    if nat_le(a407, a408) {
        let m414 = {
            let a411 = v0;
            let a412 = {
                let a409 = v2;
                let a410 = v3;
                nat_sub(a409, a410)
            };
            let a413 = v3;
            slice_bytes(a411, a412, a413)
        };
        match m414 {
            None => {
                false
            }
            Some(v4) => {
                let a415 = v4;
                let a416 = v1;
                equal(a415, a416)
            }
        }
    } else {
        false
    }
}

pub fn f121(v0: Adt6) -> Adt6 {
    Adt6::C0(match v0.clone() {
        Adt6::C0(h417, _, _, _, _, _) => {
            h417
        }
    }, match v0.clone() {
        Adt6::C0(_, h418, _, _, _, _) => {
            h418
        }
    }, Str::lit("prism"), match v0.clone() {
        Adt6::C0(_, _, _, h419, _, _) => {
            h419
        }
    }, match v0.clone() {
        Adt6::C0(_, _, _, _, h420, _) => {
            h420
        }
    }, match v0 {
        Adt6::C0(_, _, _, _, _, h421) => {
            h421
        }
    })
}

pub fn f122(p428: List<Str>, p429: List<Str>) -> bool {
    let m427 = (p428, p429);
    {
        let mut m427 = m427;
        loop {
            let step = {
                let (v0, v1) = m427;
                let m422 = v0;
                match m422.uncons() {
                    None => {
                        let m423 = v1;
                        match m423.uncons() {
                            None => {
                                Err::<(List<Str>, List<Str>), bool>(true)
                            }
                            Some((_, _)) => {
                                Err::<(List<Str>, List<Str>), bool>(false)
                            }
                        }
                    }
                    Some((v4, v5)) => {
                        let m424 = v1;
                        match m424.uncons() {
                            None => {
                                Err::<(List<Str>, List<Str>), bool>(false)
                            }
                            Some((v6, v7)) => {
                                let a425 = v4;
                                let a426 = v6;
                                if equal(a425, a426) {
                                    Ok::<(List<Str>, List<Str>), bool>((v5, v7))
                                } else {
                                    Err::<(List<Str>, List<Str>), bool>(false)
                                }
                            }
                        }
                    }
                }
            };
            match step {
                Ok(next) => { m427 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f123(v0: Adt12) -> Bytes {
    let a450 = f136(match v0.clone() {
        Adt12::C0(h430, _, _, _, _, _, _, _) => {
            h430
        }
    });
    let a451 = {
        let a448 = f136(match v0.clone() {
            Adt12::C0(_, h431, _, _, _, _, _, _) => {
                h431
            }
        });
        let a449 = {
            let a446 = f136(match v0.clone() {
                Adt12::C0(_, _, h432, _, _, _, _, _) => {
                    h432
                }
            });
            let a447 = {
                let a444 = f136(match v0.clone() {
                    Adt12::C0(_, _, _, h433, _, _, _, _) => {
                        h433
                    }
                });
                let a445 = {
                    let a442 = f136(match v0.clone() {
                        Adt12::C0(_, _, _, _, h434, _, _, _) => {
                            h434
                        }
                    });
                    let a443 = {
                        let a440 = f136(match v0.clone() {
                            Adt12::C0(_, _, _, _, _, h435, _, _) => {
                                h435
                            }
                        });
                        let a441 = {
                            let a438 = f136(match v0.clone() {
                                Adt12::C0(_, _, _, _, _, _, h436, _) => {
                                    h436
                                }
                            });
                            let a439 = f136(match v0 {
                                Adt12::C0(_, _, _, _, _, _, _, h437) => {
                                    h437
                                }
                            });
                            append_bytes(a438, a439)
                        };
                        append_bytes(a440, a441)
                    };
                    append_bytes(a442, a443)
                };
                append_bytes(a444, a445)
            };
            append_bytes(a446, a447)
        };
        append_bytes(a448, a449)
    };
    append_bytes(a450, a451)
}

pub fn f124(v0: Bytes) -> R<Adt12> {
    let v1: u64 = {
        let a452 = v0.clone();
        length_bytes(a452)
    };
    let v2: u64 = {
        let a458 = {
            let a455 = {
                let a453 = v1;
                let a454 = 72u64;
                nat_add(a453, a454)?
            };
            let a456 = 64u64;
            let a457 = 0u64;
            nat_quot(a455, a456, a457)
        };
        let a459 = 64u64;
        nat_mul(a458, a459)?
    };
    let (_, h460) = f137(Fn24::F138(v0, v1, v2), {
        let a461 = v2;
        let a462 = 64u64;
        let a463 = 0u64;
        nat_quot(a461, a462, a463)
    }, (0u64, f139()))?;
    Ok(h460)
}

pub fn f125(v0: List<Str>, v1: List<Bytes>, v2: (Bytes, Bytes)) -> R<List<Bytes>> {
    if f116(v0, {
        let (_, h464) = v2.clone();
        h464
    })? {
        Ok(List::cons(f29(List::cons(f55(Str::lit("file")), List::cons({
            let (h465, _) = v2;
            h465
        }, List::cons({
            let (_, h466) = v2;
            h466
        }, List::<Bytes>::nil())))), v1))
    } else {
        Ok(v1)
    }
}

pub fn f126(v0: Str, v1: List<Adt5>) -> Option<Adt5> {
    f140(Fn25::F141(v0), None::<Adt5>, v1)
}

pub fn f127(v0: Adt7) -> Str {
    let m467 = v0;
    match m467 {
        Adt7::C0 => {
            Str::lit("hermetic")
        }
        Adt7::C1 => {
            Str::lit("fetch")
        }
    }
}

pub fn f128(v0: Str, v1: List<Str>) -> Bytes {
    f6(f30(Fn6::F142(v0), List::<Bytes>::nil(), v1))
}

pub fn f129(v0: List<Adt5>) -> R<Bytes> {
    Ok(f6(f7(Fn0::F143, List::<Bytes>::nil(), v0)?))
}

pub fn f130(v0: Fn22, p471: bool, p472: List<Adt8>) -> bool {
    let m470 = (p471, p472);
    {
        let mut m470 = m470;
        loop {
            let step = {
                let (v1, v2) = m470;
                let m468 = v2;
                match m468.uncons() {
                    None => {
                        Err::<(bool, List<Adt8>), bool>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(bool, List<Adt8>), bool>(({
                            let c469: Fn22 = v0.clone();
                            c469.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m470 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f131(v0: bool, v1: Adt8) -> bool {
    if v0 {
        f93(v1)
    } else {
        false
    }
}

pub fn f132(v0: Fn23, p476: Option<bool>, p477: List<(Str, bool)>) -> Option<bool> {
    let m475 = (p476, p477);
    {
        let mut m475 = m475;
        loop {
            let step = {
                let (v1, v2) = m475;
                let m473 = v2;
                match m473.uncons() {
                    None => {
                        Err::<(Option<bool>, List<(Str, bool)>), Option<bool>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<bool>, List<(Str, bool)>), Option<bool>>(({
                            let c474: Fn23 = v0.clone();
                            c474.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m475 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f133(v0: Str, v1: Option<bool>, v2: (Str, bool)) -> Option<bool> {
    let a479 = {
        let (h478, _) = v2;
        h478
    };
    let a480 = v0;
    if equal(a479, a480) {
        let m481 = v1;
        match m481 {
            None => {
                Some({
                    let (_, h483) = v2;
                    h483
                })
            }
            Some(v3) => {
                Some(if v3 {
                    true
                } else {
                    let (_, h482) = v2;
                    h482
                })
            }
        }
    } else {
        v1
    }
}

pub fn f134(v0: (Option<Bytes>, List<Bytes>), v1: Bytes) -> (Option<Bytes>, List<Bytes>) {
    let m485 = {
        let (h484, _) = v0;
        h484
    };
    match m485 {
        None => {
            (Some(v1), {
                let (_, h486) = v0;
                h486
            })
        }
        Some(v2) => {
            (None::<Bytes>, List::cons({
                let a487 = v2;
                let a488 = v1;
                append_bytes(a487, a488)
            }, {
                let (_, h489) = v0;
                h489
            }))
        }
    }
}

pub fn f135(v0: List<Str>, v1: Bytes, v2: bool) -> R<u64> {
    f144(Fn26::F145(v2, v1), 0u64, v0)
}

pub fn f136(v0: u32) -> Bytes {
    let a518 = f146({
        let a490 = f147(v0, 28u32);
        let a491 = 15u32;
        fixed_u32::bit_and(a490, a491)
    });
    let a519 = {
        let a516 = f146({
            let a492 = f147(v0, 24u32);
            let a493 = 15u32;
            fixed_u32::bit_and(a492, a493)
        });
        let a517 = {
            let a514 = f146({
                let a494 = f147(v0, 20u32);
                let a495 = 15u32;
                fixed_u32::bit_and(a494, a495)
            });
            let a515 = {
                let a512 = f146({
                    let a496 = f147(v0, 16u32);
                    let a497 = 15u32;
                    fixed_u32::bit_and(a496, a497)
                });
                let a513 = {
                    let a510 = f146({
                        let a498 = f147(v0, 12u32);
                        let a499 = 15u32;
                        fixed_u32::bit_and(a498, a499)
                    });
                    let a511 = {
                        let a508 = f146({
                            let a500 = f147(v0, 8u32);
                            let a501 = 15u32;
                            fixed_u32::bit_and(a500, a501)
                        });
                        let a509 = {
                            let a506 = f146({
                                let a502 = f147(v0, 4u32);
                                let a503 = 15u32;
                                fixed_u32::bit_and(a502, a503)
                            });
                            let a507 = f146({
                                let a504 = v0;
                                let a505 = 15u32;
                                fixed_u32::bit_and(a504, a505)
                            });
                            append_bytes(a506, a507)
                        };
                        append_bytes(a508, a509)
                    };
                    append_bytes(a510, a511)
                };
                append_bytes(a512, a513)
            };
            append_bytes(a514, a515)
        };
        append_bytes(a516, a517)
    };
    append_bytes(a518, a519)
}

pub fn f137(v0: Fn24, p523: u64, p524: (u64, Adt12)) -> R<(u64, Adt12)> {
    let m522 = (p523, p524);
    {
        let mut m522 = m522;
        loop {
            let step = {
                let (v1, v2) = m522;
                let m520 = v1;
                if m520 == 0 {
                    Err::<(u64, (u64, Adt12)), R<(u64, Adt12)>>(Ok(v2))
                } else {
                    let v3 = m520 - 1;
                    Ok::<(u64, (u64, Adt12)), R<(u64, Adt12)>>((v3, {
                        let c521: Fn24 = v0.clone();
                        c521.apply(v2)?
                    }))
                }
            };
            match step {
                Ok(next) => { m522 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f138(v0: Bytes, v1: u64, v2: u64, v3: (u64, Adt12)) -> R<(u64, Adt12)> {
    Ok(({
        let a526 = {
            let (h525, _) = v3.clone();
            h525
        };
        let a527 = 64u64;
        nat_add(a526, a527)?
    }, f148({
        let (_, h528) = v3;
        h528
    }, f149(v0, v1, v2, {
        let (h529, _) = v3;
        h529
    })?)?))
}

pub fn f139() -> Adt12 {
    Adt12::C0(1779033703u32, 3144134277u32, 1013904242u32, 2773480762u32, 1359893119u32, 2600822924u32, 528734635u32, 1541459225u32)
}

pub fn f140(v0: Fn25, p533: Option<Adt5>, p534: List<Adt5>) -> Option<Adt5> {
    let m532 = (p533, p534);
    {
        let mut m532 = m532;
        loop {
            let step = {
                let (v1, v2) = m532;
                let m530 = v2;
                match m530.uncons() {
                    None => {
                        Err::<(Option<Adt5>, List<Adt5>), Option<Adt5>>(v1)
                    }
                    Some((v3, v4)) => {
                        Ok::<(Option<Adt5>, List<Adt5>), Option<Adt5>>(({
                            let c531: Fn25 = v0.clone();
                            c531.apply(v1, v3)
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m532 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f141(v0: Str, v1: Option<Adt5>, v2: Adt5) -> Option<Adt5> {
    let a538 = {
        let m537 = match v2.clone() {
            Adt5::C0(h536, _, _) => {
                h536
            }
        };
        match m537 {
            Adt6::C0(h535, _, _, _, _, _) => {
                h535
            }
        }
    };
    let a539 = v0;
    if equal(a538, a539) {
        Some(v2)
    } else {
        v1
    }
}

pub fn f142(v0: Str, v1: List<Bytes>, v2: Str) -> List<Bytes> {
    List::cons(f29(List::cons(f55(v0), List::cons(f55(v2), List::<Bytes>::nil()))), v1)
}

pub fn f143(v0: List<Bytes>, v1: Adt5) -> List<Bytes> {
    List::cons(f29(List::cons(f55(Str::lit("needs")), List::cons(f55({
        let m542 = match v1.clone() {
            Adt5::C0(h541, _, _) => {
                h541
            }
        };
        match m542 {
            Adt6::C0(h540, _, _, _, _, _) => {
                h540
            }
        }
    }), List::cons(f55(match v1 {
        Adt5::C0(_, h543, _) => {
            h543
        }
    }), List::<Bytes>::nil())))), v0)
}

pub fn f144(v0: Fn26, p547: u64, p548: List<Str>) -> R<u64> {
    let m546 = (p547, p548);
    {
        let mut m546 = m546;
        loop {
            let step = {
                let (v1, v2) = m546;
                let m544 = v2;
                match m544.uncons() {
                    None => {
                        Err::<(u64, List<Str>), R<u64>>(Ok(v1))
                    }
                    Some((v3, v4)) => {
                        Ok::<(u64, List<Str>), R<u64>>(({
                            let c545: Fn26 = v0.clone();
                            c545.apply(v1, v3)?
                        }, v4))
                    }
                }
            };
            match step {
                Ok(next) => { m546 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f145(v0: bool, v1: Bytes, v2: u64, v3: Str) -> R<u64> {
    let a549 = f150(v3.clone(), Bytes::lit(&[0x21]));
    let a550 = v0;
    if equal(a549, a550) {
        let v4: u64 = f151(v3, v1)?;
        let a551 = v2;
        let a552 = v4;
        if nat_lt(a551, a552) {
            Ok(v4)
        } else {
            Ok(v2)
        }
    } else {
        Ok(v2)
    }
}

pub fn f146(v0: u32) -> Bytes {
    let a555 = {
        let a553 = v0;
        let a554 = 8u32;
        fixed_u32::bit_and(a553, a554)
    };
    let a556 = 0u32;
    if equal(a555, a556) {
        let a559 = {
            let a557 = v0;
            let a558 = 4u32;
            fixed_u32::bit_and(a557, a558)
        };
        let a560 = 0u32;
        if equal(a559, a560) {
            let a563 = {
                let a561 = v0;
                let a562 = 2u32;
                fixed_u32::bit_and(a561, a562)
            };
            let a564 = 0u32;
            if equal(a563, a564) {
                let a567 = {
                    let a565 = v0;
                    let a566 = 1u32;
                    fixed_u32::bit_and(a565, a566)
                };
                let a568 = 0u32;
                if equal(a567, a568) {
                    Bytes::lit(&[0x30])
                } else {
                    Bytes::lit(&[0x31])
                }
            } else {
                let a571 = {
                    let a569 = v0;
                    let a570 = 1u32;
                    fixed_u32::bit_and(a569, a570)
                };
                let a572 = 0u32;
                if equal(a571, a572) {
                    Bytes::lit(&[0x32])
                } else {
                    Bytes::lit(&[0x33])
                }
            }
        } else {
            let a575 = {
                let a573 = v0;
                let a574 = 2u32;
                fixed_u32::bit_and(a573, a574)
            };
            let a576 = 0u32;
            if equal(a575, a576) {
                let a579 = {
                    let a577 = v0;
                    let a578 = 1u32;
                    fixed_u32::bit_and(a577, a578)
                };
                let a580 = 0u32;
                if equal(a579, a580) {
                    Bytes::lit(&[0x34])
                } else {
                    Bytes::lit(&[0x35])
                }
            } else {
                let a583 = {
                    let a581 = v0;
                    let a582 = 1u32;
                    fixed_u32::bit_and(a581, a582)
                };
                let a584 = 0u32;
                if equal(a583, a584) {
                    Bytes::lit(&[0x36])
                } else {
                    Bytes::lit(&[0x37])
                }
            }
        }
    } else {
        let a587 = {
            let a585 = v0;
            let a586 = 4u32;
            fixed_u32::bit_and(a585, a586)
        };
        let a588 = 0u32;
        if equal(a587, a588) {
            let a591 = {
                let a589 = v0;
                let a590 = 2u32;
                fixed_u32::bit_and(a589, a590)
            };
            let a592 = 0u32;
            if equal(a591, a592) {
                let a595 = {
                    let a593 = v0;
                    let a594 = 1u32;
                    fixed_u32::bit_and(a593, a594)
                };
                let a596 = 0u32;
                if equal(a595, a596) {
                    Bytes::lit(&[0x38])
                } else {
                    Bytes::lit(&[0x39])
                }
            } else {
                let a599 = {
                    let a597 = v0;
                    let a598 = 1u32;
                    fixed_u32::bit_and(a597, a598)
                };
                let a600 = 0u32;
                if equal(a599, a600) {
                    Bytes::lit(&[0x61])
                } else {
                    Bytes::lit(&[0x62])
                }
            }
        } else {
            let a603 = {
                let a601 = v0;
                let a602 = 2u32;
                fixed_u32::bit_and(a601, a602)
            };
            let a604 = 0u32;
            if equal(a603, a604) {
                let a607 = {
                    let a605 = v0;
                    let a606 = 1u32;
                    fixed_u32::bit_and(a605, a606)
                };
                let a608 = 0u32;
                if equal(a607, a608) {
                    Bytes::lit(&[0x63])
                } else {
                    Bytes::lit(&[0x64])
                }
            } else {
                let a611 = {
                    let a609 = v0;
                    let a610 = 1u32;
                    fixed_u32::bit_and(a609, a610)
                };
                let a612 = 0u32;
                if equal(a611, a612) {
                    Bytes::lit(&[0x65])
                } else {
                    Bytes::lit(&[0x66])
                }
            }
        }
    }
}

pub fn f147(v0: u32, v1: u32) -> u32 {
    let m615 = {
        let a613 = v0;
        let a614 = v1;
        fixed_u32::shift_right(a613, a614)
    };
    match m615 {
        None => {
            0u32
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f148(v0: Adt12, v1: Adt13) -> R<Adt12> {
    let v2: Adt14 = f152(Fn27::F153, 64u64, Adt14::C0(match v0.clone() {
        Adt12::C0(h616, _, _, _, _, _, _, _) => {
            h616
        }
    }, match v0.clone() {
        Adt12::C0(_, h617, _, _, _, _, _, _) => {
            h617
        }
    }, match v0.clone() {
        Adt12::C0(_, _, h618, _, _, _, _, _) => {
            h618
        }
    }, match v0.clone() {
        Adt12::C0(_, _, _, h619, _, _, _, _) => {
            h619
        }
    }, match v0.clone() {
        Adt12::C0(_, _, _, _, h620, _, _, _) => {
            h620
        }
    }, match v0.clone() {
        Adt12::C0(_, _, _, _, _, h621, _, _) => {
            h621
        }
    }, match v0.clone() {
        Adt12::C0(_, _, _, _, _, _, h622, _) => {
            h622
        }
    }, match v0.clone() {
        Adt12::C0(_, _, _, _, _, _, _, h623) => {
            h623
        }
    }, v1, 0u64))?;
    Ok(Adt12::C0(f154(match v0.clone() {
        Adt12::C0(h624, _, _, _, _, _, _, _) => {
            h624
        }
    }, match v2.clone() {
        Adt14::C0(h625, _, _, _, _, _, _, _, _, _) => {
            h625
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, h626, _, _, _, _, _, _) => {
            h626
        }
    }, match v2.clone() {
        Adt14::C0(_, h627, _, _, _, _, _, _, _, _) => {
            h627
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, _, h628, _, _, _, _, _) => {
            h628
        }
    }, match v2.clone() {
        Adt14::C0(_, _, h629, _, _, _, _, _, _, _) => {
            h629
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, _, _, h630, _, _, _, _) => {
            h630
        }
    }, match v2.clone() {
        Adt14::C0(_, _, _, h631, _, _, _, _, _, _) => {
            h631
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, _, _, _, h632, _, _, _) => {
            h632
        }
    }, match v2.clone() {
        Adt14::C0(_, _, _, _, h633, _, _, _, _, _) => {
            h633
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, _, _, _, _, h634, _, _) => {
            h634
        }
    }, match v2.clone() {
        Adt14::C0(_, _, _, _, _, h635, _, _, _, _) => {
            h635
        }
    }), f154(match v0.clone() {
        Adt12::C0(_, _, _, _, _, _, h636, _) => {
            h636
        }
    }, match v2.clone() {
        Adt14::C0(_, _, _, _, _, _, h637, _, _, _) => {
            h637
        }
    }), f154(match v0 {
        Adt12::C0(_, _, _, _, _, _, _, h638) => {
            h638
        }
    }, match v2 {
        Adt14::C0(_, _, _, _, _, _, _, h639, _, _) => {
            h639
        }
    })))
}

pub fn f149(v0: Bytes, v1: u64, v2: u64, v3: u64) -> R<Adt13> {
    Ok(Adt13::C0(f155(v0.clone(), v1, v2, v3)?, f155(v0.clone(), v1, v2, {
        let a640 = v3;
        let a641 = 4u64;
        nat_add(a640, a641)?
    })?, f155(v0.clone(), v1, v2, {
        let a642 = v3;
        let a643 = 8u64;
        nat_add(a642, a643)?
    })?, f155(v0.clone(), v1, v2, {
        let a644 = v3;
        let a645 = 12u64;
        nat_add(a644, a645)?
    })?, f155(v0.clone(), v1, v2, {
        let a646 = v3;
        let a647 = 16u64;
        nat_add(a646, a647)?
    })?, f155(v0.clone(), v1, v2, {
        let a648 = v3;
        let a649 = 20u64;
        nat_add(a648, a649)?
    })?, f155(v0.clone(), v1, v2, {
        let a650 = v3;
        let a651 = 24u64;
        nat_add(a650, a651)?
    })?, f155(v0.clone(), v1, v2, {
        let a652 = v3;
        let a653 = 28u64;
        nat_add(a652, a653)?
    })?, f155(v0.clone(), v1, v2, {
        let a654 = v3;
        let a655 = 32u64;
        nat_add(a654, a655)?
    })?, f155(v0.clone(), v1, v2, {
        let a656 = v3;
        let a657 = 36u64;
        nat_add(a656, a657)?
    })?, f155(v0.clone(), v1, v2, {
        let a658 = v3;
        let a659 = 40u64;
        nat_add(a658, a659)?
    })?, f155(v0.clone(), v1, v2, {
        let a660 = v3;
        let a661 = 44u64;
        nat_add(a660, a661)?
    })?, f155(v0.clone(), v1, v2, {
        let a662 = v3;
        let a663 = 48u64;
        nat_add(a662, a663)?
    })?, f155(v0.clone(), v1, v2, {
        let a664 = v3;
        let a665 = 52u64;
        nat_add(a664, a665)?
    })?, f155(v0.clone(), v1, v2, {
        let a666 = v3;
        let a667 = 56u64;
        nat_add(a666, a667)?
    })?, f155(v0, v1, v2, {
        let a668 = v3;
        let a669 = 60u64;
        nat_add(a668, a669)?
    })?))
}

pub fn f150(v0: Str, v1: Bytes) -> bool {
    f156(f55(v0), v1)
}

pub fn f151(v0: Str, v1: Bytes) -> R<u64> {
    let v2: Bytes = if f150(v0.clone(), Bytes::lit(&[0x21])) {
        f157(v0)
    } else {
        f55(v0)
    };
    if f156(v1.clone(), v2.clone()) {
        if f156(v1, Bytes::lit(&[0x40])) {
            if f156(v2.clone(), Bytes::lit(&[0x40])) {
                let a671 = {
                    let a670 = v2;
                    length_bytes(a670)
                };
                let a672 = 1u64;
                nat_add(a671, a672)
            } else {
                Ok(0u64)
            }
        } else {
            let a674 = {
                let a673 = v2;
                length_bytes(a673)
            };
            let a675 = 1u64;
            nat_add(a674, a675)
        }
    } else {
        Ok(0u64)
    }
}

pub fn f152(v0: Fn27, p679: u64, p680: Adt14) -> R<Adt14> {
    let m678 = (p679, p680);
    {
        let mut m678 = m678;
        loop {
            let step = {
                let (v1, v2) = m678;
                let m676 = v1;
                if m676 == 0 {
                    Err::<(u64, Adt14), R<Adt14>>(Ok(v2))
                } else {
                    let v3 = m676 - 1;
                    Ok::<(u64, Adt14), R<Adt14>>((v3, {
                        let c677: Fn27 = v0.clone();
                        c677.apply(v2)?
                    }))
                }
            };
            match step {
                Ok(next) => { m678 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f153(v0: Adt14) -> R<Adt14> {
    f158(v0)
}

pub fn f154(v0: u32, v1: u32) -> u32 {
    let m683 = {
        let a681 = f159(v0);
        let a682 = f159(v1);
        fixed_u64::checked_add(a681, a682)
    };
    match m683 {
        None => {
            0u32
        }
        Some(v2) => {
            f160(v2)
        }
    }
}

pub fn f155(v0: Bytes, v1: u64, v2: u64, v3: u64) -> R<u32> {
    let a686 = {
        let a684 = v3;
        let a685 = 8u64;
        nat_add(a684, a685)?
    };
    let a687 = v2;
    if nat_eq(a686, a687) {
        Ok(f161({
            let a690 = {
                let a688 = v1;
                let a689 = 8u64;
                nat_mul(a688, a689)?
            };
            let a691 = 4294967296u64;
            let a692 = 0u64;
            nat_quot(a690, a691, a692)
        }))
    } else {
        let a695 = {
            let a693 = v3;
            let a694 = 4u64;
            nat_add(a693, a694)?
        };
        let a696 = v2;
        if nat_eq(a695, a696) {
            Ok(f161({
                let a699 = {
                    let a697 = v1;
                    let a698 = 8u64;
                    nat_mul(a697, a698)?
                };
                let a700 = 4294967296u64;
                let a701 = 0u64;
                nat_rem(a699, a700, a701)
            }))
        } else {
            Ok(f162(f163(v0.clone(), v1, v3), f163(v0.clone(), v1, {
                let a702 = v3;
                let a703 = 1u64;
                nat_add(a702, a703)?
            }), f163(v0.clone(), v1, {
                let a704 = v3;
                let a705 = 2u64;
                nat_add(a704, a705)?
            }), f163(v0, v1, {
                let a706 = v3;
                let a707 = 3u64;
                nat_add(a706, a707)?
            })))
        }
    }
}

pub fn f156(v0: Bytes, v1: Bytes) -> bool {
    let m712 = {
        let a709 = v0;
        let a710 = 0u64;
        let a711 = {
            let a708 = v1.clone();
            length_bytes(a708)
        };
        slice_bytes(a709, a710, a711)
    };
    match m712 {
        None => {
            false
        }
        Some(v2) => {
            let a713 = v2;
            let a714 = v1;
            equal(a713, a714)
        }
    }
}

pub fn f157(v0: Str) -> Bytes {
    let v1: Bytes = f55(v0);
    f37(v1.clone(), 1u64, {
        let a716 = {
            let a715 = v1;
            length_bytes(a715)
        };
        let a717 = 1u64;
        nat_sub(a716, a717)
    })
}

pub fn f158(v0: Adt14) -> R<Adt14> {
    let v1: u32 = f164(match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, _, h718) => {
            h718
        }
    });
    let v2: u32 = f154(match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, h719, _, _) => {
            h719
        }
    }, f154(f165(match v0.clone() {
        Adt14::C0(_, _, _, _, h720, _, _, _, _, _) => {
            h720
        }
    }), f154(f166(match v0.clone() {
        Adt14::C0(_, _, _, _, h721, _, _, _, _, _) => {
            h721
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, h722, _, _, _, _) => {
            h722
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, h723, _, _, _) => {
            h723
        }
    }), f154(v1, {
        let m726 = match v0.clone() {
            Adt14::C0(_, _, _, _, _, _, _, _, h725, _) => {
                h725
            }
        };
        match m726 {
            Adt13::C0(h724, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
                h724
            }
        }
    }))));
    let v3: u32 = f154(f167(match v0.clone() {
        Adt14::C0(h727, _, _, _, _, _, _, _, _, _) => {
            h727
        }
    }), f168(match v0.clone() {
        Adt14::C0(h728, _, _, _, _, _, _, _, _, _) => {
            h728
        }
    }, match v0.clone() {
        Adt14::C0(_, h729, _, _, _, _, _, _, _, _) => {
            h729
        }
    }, match v0.clone() {
        Adt14::C0(_, _, h730, _, _, _, _, _, _, _) => {
            h730
        }
    }));
    Ok(Adt14::C0(f154(v2, v3), match v0.clone() {
        Adt14::C0(h731, _, _, _, _, _, _, _, _, _) => {
            h731
        }
    }, match v0.clone() {
        Adt14::C0(_, h732, _, _, _, _, _, _, _, _) => {
            h732
        }
    }, match v0.clone() {
        Adt14::C0(_, _, h733, _, _, _, _, _, _, _) => {
            h733
        }
    }, f154(match v0.clone() {
        Adt14::C0(_, _, _, h734, _, _, _, _, _, _) => {
            h734
        }
    }, v2), match v0.clone() {
        Adt14::C0(_, _, _, _, h735, _, _, _, _, _) => {
            h735
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, h736, _, _, _, _) => {
            h736
        }
    }, match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, h737, _, _, _) => {
            h737
        }
    }, f169(match v0.clone() {
        Adt14::C0(_, _, _, _, _, _, _, _, h738, _) => {
            h738
        }
    }), {
        let a740 = match v0 {
            Adt14::C0(_, _, _, _, _, _, _, _, _, h739) => {
                h739
            }
        };
        let a741 = 1u64;
        nat_add(a740, a741)?
    }))
}

pub fn f159(v0: u32) -> u64 {
    let m743 = {
        let a742 = v0;
        fixed_u64::convert(i128::from(a742))
    };
    match m743 {
        None => {
            0u64
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f160(v0: u64) -> u32 {
    let m747 = {
        let a746 = {
            let a744 = v0;
            let a745 = 4294967295u64;
            fixed_u64::bit_and(a744, a745)
        };
        fixed_u32::convert(i128::from(a746))
    };
    match m747 {
        None => {
            0u32
        }
        Some(v1) => {
            v1
        }
    }
}

pub fn f161(v0: u64) -> u32 {
    let (_, h748) = {
        let (_, h749) = f170(Fn28::F171, 32u64, (v0, (1u32, 0u32)));
        h749
    };
    h748
}

pub fn f162(v0: u32, v1: u32, v2: u32, v3: u32) -> u32 {
    let a754 = f172(v0, 24u32);
    let a755 = {
        let a752 = f172(v1, 16u32);
        let a753 = {
            let a750 = f172(v2, 8u32);
            let a751 = v3;
            fixed_u32::bit_or(a750, a751)
        };
        fixed_u32::bit_or(a752, a753)
    };
    fixed_u32::bit_or(a754, a755)
}

pub fn f163(v0: Bytes, v1: u64, v2: u64) -> u32 {
    let a756 = v2;
    let a757 = v1;
    if nat_lt(a756, a757) {
        let m760 = {
            let a758 = v0;
            let a759 = v2;
            index_bytes(a758, a759)
        };
        match m760 {
            None => {
                0u32
            }
            Some(v3) => {
                let m762 = {
                    let a761 = v3;
                    fixed_u32::convert(i128::from(a761))
                };
                match m762 {
                    None => {
                        0u32
                    }
                    Some(v4) => {
                        v4
                    }
                }
            }
        }
    } else {
        let a763 = v2;
        let a764 = v1;
        if nat_eq(a763, a764) {
            128u32
        } else {
            0u32
        }
    }
}

pub fn f164(v0: u64) -> u32 {
    let a765 = v0;
    let a766 = 32u64;
    if nat_lt(a765, a766) {
        let a767 = v0;
        let a768 = 16u64;
        if nat_lt(a767, a768) {
            let a769 = v0;
            let a770 = 8u64;
            if nat_lt(a769, a770) {
                let a771 = v0;
                let a772 = 4u64;
                if nat_lt(a771, a772) {
                    let a773 = v0;
                    let a774 = 2u64;
                    if nat_lt(a773, a774) {
                        let a775 = v0;
                        let a776 = 1u64;
                        if nat_lt(a775, a776) {
                            1116352408u32
                        } else {
                            1899447441u32
                        }
                    } else {
                        let a777 = v0;
                        let a778 = 3u64;
                        if nat_lt(a777, a778) {
                            3049323471u32
                        } else {
                            3921009573u32
                        }
                    }
                } else {
                    let a779 = v0;
                    let a780 = 6u64;
                    if nat_lt(a779, a780) {
                        let a781 = v0;
                        let a782 = 5u64;
                        if nat_lt(a781, a782) {
                            961987163u32
                        } else {
                            1508970993u32
                        }
                    } else {
                        let a783 = v0;
                        let a784 = 7u64;
                        if nat_lt(a783, a784) {
                            2453635748u32
                        } else {
                            2870763221u32
                        }
                    }
                }
            } else {
                let a785 = v0;
                let a786 = 12u64;
                if nat_lt(a785, a786) {
                    let a787 = v0;
                    let a788 = 10u64;
                    if nat_lt(a787, a788) {
                        let a789 = v0;
                        let a790 = 9u64;
                        if nat_lt(a789, a790) {
                            3624381080u32
                        } else {
                            310598401u32
                        }
                    } else {
                        let a791 = v0;
                        let a792 = 11u64;
                        if nat_lt(a791, a792) {
                            607225278u32
                        } else {
                            1426881987u32
                        }
                    }
                } else {
                    let a793 = v0;
                    let a794 = 14u64;
                    if nat_lt(a793, a794) {
                        let a795 = v0;
                        let a796 = 13u64;
                        if nat_lt(a795, a796) {
                            1925078388u32
                        } else {
                            2162078206u32
                        }
                    } else {
                        let a797 = v0;
                        let a798 = 15u64;
                        if nat_lt(a797, a798) {
                            2614888103u32
                        } else {
                            3248222580u32
                        }
                    }
                }
            }
        } else {
            let a799 = v0;
            let a800 = 24u64;
            if nat_lt(a799, a800) {
                let a801 = v0;
                let a802 = 20u64;
                if nat_lt(a801, a802) {
                    let a803 = v0;
                    let a804 = 18u64;
                    if nat_lt(a803, a804) {
                        let a805 = v0;
                        let a806 = 17u64;
                        if nat_lt(a805, a806) {
                            3835390401u32
                        } else {
                            4022224774u32
                        }
                    } else {
                        let a807 = v0;
                        let a808 = 19u64;
                        if nat_lt(a807, a808) {
                            264347078u32
                        } else {
                            604807628u32
                        }
                    }
                } else {
                    let a809 = v0;
                    let a810 = 22u64;
                    if nat_lt(a809, a810) {
                        let a811 = v0;
                        let a812 = 21u64;
                        if nat_lt(a811, a812) {
                            770255983u32
                        } else {
                            1249150122u32
                        }
                    } else {
                        let a813 = v0;
                        let a814 = 23u64;
                        if nat_lt(a813, a814) {
                            1555081692u32
                        } else {
                            1996064986u32
                        }
                    }
                }
            } else {
                let a815 = v0;
                let a816 = 28u64;
                if nat_lt(a815, a816) {
                    let a817 = v0;
                    let a818 = 26u64;
                    if nat_lt(a817, a818) {
                        let a819 = v0;
                        let a820 = 25u64;
                        if nat_lt(a819, a820) {
                            2554220882u32
                        } else {
                            2821834349u32
                        }
                    } else {
                        let a821 = v0;
                        let a822 = 27u64;
                        if nat_lt(a821, a822) {
                            2952996808u32
                        } else {
                            3210313671u32
                        }
                    }
                } else {
                    let a823 = v0;
                    let a824 = 30u64;
                    if nat_lt(a823, a824) {
                        let a825 = v0;
                        let a826 = 29u64;
                        if nat_lt(a825, a826) {
                            3336571891u32
                        } else {
                            3584528711u32
                        }
                    } else {
                        let a827 = v0;
                        let a828 = 31u64;
                        if nat_lt(a827, a828) {
                            113926993u32
                        } else {
                            338241895u32
                        }
                    }
                }
            }
        }
    } else {
        let a829 = v0;
        let a830 = 48u64;
        if nat_lt(a829, a830) {
            let a831 = v0;
            let a832 = 40u64;
            if nat_lt(a831, a832) {
                let a833 = v0;
                let a834 = 36u64;
                if nat_lt(a833, a834) {
                    let a835 = v0;
                    let a836 = 34u64;
                    if nat_lt(a835, a836) {
                        let a837 = v0;
                        let a838 = 33u64;
                        if nat_lt(a837, a838) {
                            666307205u32
                        } else {
                            773529912u32
                        }
                    } else {
                        let a839 = v0;
                        let a840 = 35u64;
                        if nat_lt(a839, a840) {
                            1294757372u32
                        } else {
                            1396182291u32
                        }
                    }
                } else {
                    let a841 = v0;
                    let a842 = 38u64;
                    if nat_lt(a841, a842) {
                        let a843 = v0;
                        let a844 = 37u64;
                        if nat_lt(a843, a844) {
                            1695183700u32
                        } else {
                            1986661051u32
                        }
                    } else {
                        let a845 = v0;
                        let a846 = 39u64;
                        if nat_lt(a845, a846) {
                            2177026350u32
                        } else {
                            2456956037u32
                        }
                    }
                }
            } else {
                let a847 = v0;
                let a848 = 44u64;
                if nat_lt(a847, a848) {
                    let a849 = v0;
                    let a850 = 42u64;
                    if nat_lt(a849, a850) {
                        let a851 = v0;
                        let a852 = 41u64;
                        if nat_lt(a851, a852) {
                            2730485921u32
                        } else {
                            2820302411u32
                        }
                    } else {
                        let a853 = v0;
                        let a854 = 43u64;
                        if nat_lt(a853, a854) {
                            3259730800u32
                        } else {
                            3345764771u32
                        }
                    }
                } else {
                    let a855 = v0;
                    let a856 = 46u64;
                    if nat_lt(a855, a856) {
                        let a857 = v0;
                        let a858 = 45u64;
                        if nat_lt(a857, a858) {
                            3516065817u32
                        } else {
                            3600352804u32
                        }
                    } else {
                        let a859 = v0;
                        let a860 = 47u64;
                        if nat_lt(a859, a860) {
                            4094571909u32
                        } else {
                            275423344u32
                        }
                    }
                }
            }
        } else {
            let a861 = v0;
            let a862 = 56u64;
            if nat_lt(a861, a862) {
                let a863 = v0;
                let a864 = 52u64;
                if nat_lt(a863, a864) {
                    let a865 = v0;
                    let a866 = 50u64;
                    if nat_lt(a865, a866) {
                        let a867 = v0;
                        let a868 = 49u64;
                        if nat_lt(a867, a868) {
                            430227734u32
                        } else {
                            506948616u32
                        }
                    } else {
                        let a869 = v0;
                        let a870 = 51u64;
                        if nat_lt(a869, a870) {
                            659060556u32
                        } else {
                            883997877u32
                        }
                    }
                } else {
                    let a871 = v0;
                    let a872 = 54u64;
                    if nat_lt(a871, a872) {
                        let a873 = v0;
                        let a874 = 53u64;
                        if nat_lt(a873, a874) {
                            958139571u32
                        } else {
                            1322822218u32
                        }
                    } else {
                        let a875 = v0;
                        let a876 = 55u64;
                        if nat_lt(a875, a876) {
                            1537002063u32
                        } else {
                            1747873779u32
                        }
                    }
                }
            } else {
                let a877 = v0;
                let a878 = 60u64;
                if nat_lt(a877, a878) {
                    let a879 = v0;
                    let a880 = 58u64;
                    if nat_lt(a879, a880) {
                        let a881 = v0;
                        let a882 = 57u64;
                        if nat_lt(a881, a882) {
                            1955562222u32
                        } else {
                            2024104815u32
                        }
                    } else {
                        let a883 = v0;
                        let a884 = 59u64;
                        if nat_lt(a883, a884) {
                            2227730452u32
                        } else {
                            2361852424u32
                        }
                    }
                } else {
                    let a885 = v0;
                    let a886 = 62u64;
                    if nat_lt(a885, a886) {
                        let a887 = v0;
                        let a888 = 61u64;
                        if nat_lt(a887, a888) {
                            2428436474u32
                        } else {
                            2756734187u32
                        }
                    } else {
                        let a889 = v0;
                        let a890 = 63u64;
                        if nat_lt(a889, a890) {
                            3204031479u32
                        } else {
                            3329325298u32
                        }
                    }
                }
            }
        }
    }
}

pub fn f165(v0: u32) -> u32 {
    let a893 = {
        let a891 = f173(v0, 6u32, 26u32);
        let a892 = f173(v0, 11u32, 21u32);
        fixed_u32::bit_xor(a891, a892)
    };
    let a894 = f173(v0, 25u32, 7u32);
    fixed_u32::bit_xor(a893, a894)
}

pub fn f166(v0: u32, v1: u32, v2: u32) -> u32 {
    let a900 = {
        let a895 = v0;
        let a896 = v1;
        fixed_u32::bit_and(a895, a896)
    };
    let a901 = {
        let a898 = {
            let a897 = v0;
            fixed_u32::bit_not(a897)
        };
        let a899 = v2;
        fixed_u32::bit_and(a898, a899)
    };
    fixed_u32::bit_xor(a900, a901)
}

pub fn f167(v0: u32) -> u32 {
    let a904 = {
        let a902 = f173(v0, 2u32, 30u32);
        let a903 = f173(v0, 13u32, 19u32);
        fixed_u32::bit_xor(a902, a903)
    };
    let a905 = f173(v0, 22u32, 10u32);
    fixed_u32::bit_xor(a904, a905)
}

pub fn f168(v0: u32, v1: u32, v2: u32) -> u32 {
    let a914 = {
        let a910 = {
            let a906 = v0;
            let a907 = v1;
            fixed_u32::bit_and(a906, a907)
        };
        let a911 = {
            let a908 = v0;
            let a909 = v2;
            fixed_u32::bit_and(a908, a909)
        };
        fixed_u32::bit_xor(a910, a911)
    };
    let a915 = {
        let a912 = v1;
        let a913 = v2;
        fixed_u32::bit_and(a912, a913)
    };
    fixed_u32::bit_xor(a914, a915)
}

pub fn f169(v0: Adt13) -> Adt13 {
    Adt13::C0(match v0.clone() {
        Adt13::C0(_, h916, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h916
        }
    }, match v0.clone() {
        Adt13::C0(_, _, h917, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h917
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, h918, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h918
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, h919, _, _, _, _, _, _, _, _, _, _, _) => {
            h919
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, h920, _, _, _, _, _, _, _, _, _, _) => {
            h920
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, h921, _, _, _, _, _, _, _, _, _) => {
            h921
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, h922, _, _, _, _, _, _, _, _) => {
            h922
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, h923, _, _, _, _, _, _, _) => {
            h923
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, h924, _, _, _, _, _, _) => {
            h924
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, h925, _, _, _, _, _) => {
            h925
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, h926, _, _, _, _) => {
            h926
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, _, h927, _, _, _) => {
            h927
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, h928, _, _) => {
            h928
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, h929, _) => {
            h929
        }
    }, match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, h930) => {
            h930
        }
    }, f154(f174(match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, _, _, _, _, _, h931, _) => {
            h931
        }
    }), f154(match v0.clone() {
        Adt13::C0(_, _, _, _, _, _, _, _, _, h932, _, _, _, _, _, _) => {
            h932
        }
    }, f154(f175(match v0.clone() {
        Adt13::C0(_, h933, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h933
        }
    }), match v0 {
        Adt13::C0(h934, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _) => {
            h934
        }
    }))))
}

pub fn f170(v0: Fn28, p938: u64, p939: (u64, (u32, u32))) -> (u64, (u32, u32)) {
    let m937 = (p938, p939);
    {
        let mut m937 = m937;
        loop {
            let step = {
                let (v1, v2) = m937;
                let m935 = v1;
                if m935 == 0 {
                    Err::<(u64, (u64, (u32, u32))), (u64, (u32, u32))>(v2)
                } else {
                    let v3 = m935 - 1;
                    Ok::<(u64, (u64, (u32, u32))), (u64, (u32, u32))>((v3, {
                        let c936: Fn28 = v0.clone();
                        c936.apply(v2)
                    }))
                }
            };
            match step {
                Ok(next) => { m937 = next; }
                Err(done) => break done,
            }
        }
    }
}

pub fn f171(v0: (u64, (u32, u32))) -> (u64, (u32, u32)) {
    let v1: u64 = {
        let (h940, _) = v0;
        h940
    };
    let v2: u32 = {
        let (h941, _) = {
            let (_, h942) = v0;
            h942
        };
        h941
    };
    let v3: u32 = {
        let (_, h943) = {
            let (_, h944) = v0;
            h944
        };
        h943
    };
    ({
        let a945 = v1;
        let a946 = 2u64;
        let a947 = 0u64;
        nat_quot(a945, a946, a947)
    }, (f172(v2, 1u32), {
        let a951 = {
            let a948 = v1;
            let a949 = 2u64;
            let a950 = 0u64;
            nat_rem(a948, a949, a950)
        };
        let a952 = 1u64;
        if nat_eq(a951, a952) {
            let a953 = v3;
            let a954 = v2;
            fixed_u32::bit_or(a953, a954)
        } else {
            v3
        }
    }))
}

pub fn f172(v0: u32, v1: u32) -> u32 {
    let m957 = {
        let a955 = v0;
        let a956 = v1;
        fixed_u32::shift_left(a955, a956)
    };
    match m957 {
        None => {
            0u32
        }
        Some(v2) => {
            v2
        }
    }
}

pub fn f173(v0: u32, v1: u32, v2: u32) -> u32 {
    let a958 = f147(v0, v1);
    let a959 = f172(v0, v2);
    fixed_u32::bit_or(a958, a959)
}

pub fn f174(v0: u32) -> u32 {
    let a962 = {
        let a960 = f173(v0, 17u32, 15u32);
        let a961 = f173(v0, 19u32, 13u32);
        fixed_u32::bit_xor(a960, a961)
    };
    let a963 = f147(v0, 10u32);
    fixed_u32::bit_xor(a962, a963)
}

pub fn f175(v0: u32) -> u32 {
    let a966 = {
        let a964 = f173(v0, 7u32, 25u32);
        let a965 = f173(v0, 18u32, 14u32);
        fixed_u32::bit_xor(a964, a965)
    };
    let a967 = f147(v0, 3u32);
    fixed_u32::bit_xor(a966, a967)
}
